# engine.py
import json
import math

ALPHA = 0.01
BETA = 0.5

def _to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def _compute_time_per_step(model_size_gb, total_gpus, base_sec, scale_per_gb):
    # Simple heuristic: larger models take longer, more GPUs reduce per-step time.
    base_sec = _to_float(base_sec, 0.4)
    model_size_gb = _to_float(model_size_gb, 1.0)
    scale_per_gb = _to_float(scale_per_gb, 0.08)
    total_gpus = max(1, _to_int(total_gpus, 1))
    return base_sec + (model_size_gb * scale_per_gb / max(1, total_gpus))

def _all_reduce_comm_time(model_size_gb, bandwidth_gbps, rtt_ms, providers_used, topology):
    # Ring or mesh all-reduce approximation.
    p = max(1, providers_used)
    rtt_factor = max(1.0, math.log2(p))
    if topology == "mesh":
        bandwidth_factor = max(1.0, p - 1)
    else:
        bandwidth_factor = 2 * (p - 1) / p
    return (model_size_gb / max(0.1, bandwidth_gbps)) * bandwidth_factor + (rtt_ms / 1000.0) * rtt_factor

def _provider_egress_rate(provider_name):
    name = provider_name.lower()
    if "aws" in name:
        return 0.09
    if "azure" in name:
        return 0.08
    if "gcp" in name:
        return 0.12
    if "paperspace" in name:
        return 0.10
    if "lambda" in name:
        return 0.07
    if "runpod" in name:
        return 0.06
    if "vast" in name:
        return 0.02
    return 0.09

def _merge_egress_overrides(defaults, overrides):
    merged = dict(defaults)
    for key, value in overrides.items():
        if value is None:
            continue
        merged[key] = value
    return merged

def run_geo_nap(
    required_gpus,
    r_max,
    model_size,
    steps,
    dataset_size_gb,
    epochs,
    batch_size,
    sample_size_gb,
    data_source_provider,
    egress_overrides,
    topology,
    gpu_model,
    training_hours=0.0,
    base_compute_sec=0.4,
    compute_scale_per_gb=0.08,
    bandwidth_base_gbps=10.0,
):
    required_gpus = max(1, _to_int(required_gpus, 1))
    r_max = _to_float(r_max, 20.0)
    model_size = _to_float(model_size, 5.0)
    steps = _to_int(steps, 0)
    dataset_size_gb = _to_float(dataset_size_gb, 1.0)
    epochs = max(1, _to_int(epochs, 1))
    batch_size = max(1, _to_int(batch_size, 1))
    sample_size_gb = _to_float(sample_size_gb, 0.01)
    training_hours = _to_float(training_hours, 0.0)
    base_compute_sec = _to_float(base_compute_sec, 0.4)
    compute_scale_per_gb = _to_float(compute_scale_per_gb, 0.08)
    bandwidth_base_gbps = _to_float(bandwidth_base_gbps, 10.0)

    providers = json.load(open("cache/providers.json"))

    enriched = []
    for p in providers:
        name = p["provider"] + "_" + p["region"]
        price = p["price"]
        rtt = p.get("rtt", 30)
        bw = p.get("bandwidth", 10)
        gpu = p.get("gpu", "unknown")

        network_penalty = (1 + ALPHA * rtt) * (1 + BETA / bw)
        effective_price = price * network_penalty

        capacity = 8 if "vast" in name else 32

        enriched.append({
            "name": name,
            "price": effective_price,
            "rtt": rtt,
            "capacity": capacity,
            "bandwidth": bw,
            "gpu": gpu,
        })

    # Step 1: filter by RTT and optional GPU model
    model_filter = (gpu_model or "").strip().lower()
    if model_filter and model_filter != "any":
        model_allowed = [p for p in enriched if model_filter in str(p["gpu"]).lower()]
    else:
        model_allowed = enriched

    allowed = [p for p in model_allowed if p["rtt"] <= r_max]
    forbidden = [p["name"] for p in model_allowed if p["rtt"] > r_max]

    # Step 2: sort by effective cost
    allowed.sort(key=lambda x: x["price"])

    # Step 3: greedy allocation
    placement = {}
    remaining = required_gpus
    total_cost = 0

    for p in allowed:
        if remaining <= 0:
            break
        alloc = min(p["capacity"], remaining)
        placement[p["name"]] = alloc
        total_cost += alloc * p["price"] * steps
        remaining -= alloc

    # Step 4: fallback if still missing GPUs
    if remaining > 0:
        others = [p for p in model_allowed if p["rtt"] > r_max]
        others.sort(key=lambda x: x["price"])
        for p in others:
            if remaining <= 0:
                break
            alloc = min(p["capacity"], remaining)
            placement[p["name"]] = alloc
            total_cost += alloc * p["price"] * steps
            remaining -= alloc

    providers_used = len([k for k, v in placement.items() if v > 0])
    if providers_used == 0:
        return placement, 0.0, forbidden, {
            "compute_cost": 0.0,
            "egress_cost": 0.0,
            "inter_provider_cost": 0.0,
            "total_time_hours": 0.0,
            "compute_time_per_step_sec": 0.0,
            "comm_time_per_step_sec": 0.0,
            "steps_per_epoch": 0,
            "total_steps": 0,
            "cost_per_epoch": 0.0,
            "egress_rate_source": 0.0,
            "egress_rate_by_provider": {},
            "pairwise_costs": {},
        }

    steps_per_epoch = math.ceil(dataset_size_gb / max(1e-6, batch_size * sample_size_gb))
    total_steps = steps if steps > 0 else steps_per_epoch * max(1, epochs)

    # Compute time estimate
    compute_time_per_step = _compute_time_per_step(
        model_size_gb=model_size,
        total_gpus=required_gpus,
        base_sec=base_compute_sec,
        scale_per_gb=compute_scale_per_gb,
    )

    # Communication time estimate uses weighted average bandwidth/RTT
    used = [p for p in enriched if placement.get(p["name"], 0) > 0]
    avg_bw = sum(p["bandwidth"] for p in used) / max(1, len(used))
    avg_rtt = sum(p["rtt"] for p in used) / max(1, len(used))
    comm_time_per_step = _all_reduce_comm_time(
        model_size_gb=model_size,
        bandwidth_gbps=avg_bw,
        rtt_ms=avg_rtt,
        providers_used=providers_used,
        topology=topology,
    )

    derived_hours = (total_steps * (compute_time_per_step + comm_time_per_step)) / 3600.0
    total_time_hours = training_hours if training_hours > 0 else derived_hours

    # Compute cost uses time-based pricing
    compute_cost = 0.0
    for p in used:
        gpus = placement[p["name"]]
        compute_cost += gpus * p["price"] * total_time_hours

    # Egress from data source per step (streamed dataset)
    egress_cost = 0.0
    source_rate = _provider_egress_rate(data_source_provider or "")
    base_rates = {p["name"]: _provider_egress_rate(p["name"]) for p in used}
    egress_rate_by_provider = _merge_egress_overrides(base_rates, egress_overrides)
    if data_source_provider:
        egress_rate_by_provider[data_source_provider] = egress_overrides.get(
            data_source_provider, source_rate
        )
    source_rate = egress_rate_by_provider.get(data_source_provider, source_rate)
    for p in used:
        if data_source_provider and data_source_provider.lower() not in p["name"].lower():
            egress_cost += dataset_size_gb * total_steps * source_rate

    # Inter-provider sync cost per step (all-reduce)
    inter_provider_cost = 0.0
    pairwise_costs = {}
    volume_gb = model_size * total_steps
    for src in used:
        for dst in used:
            if src["name"] == dst["name"]:
                continue
            min_bw = min(src["bandwidth"], dst["bandwidth"])
            bw_penalty = bandwidth_base_gbps / max(0.1, min_bw)
            cost = volume_gb * egress_rate_by_provider[src["name"]] * bw_penalty
            pairwise_costs[(src["name"], dst["name"])] = cost
            inter_provider_cost += cost

    total_cost = compute_cost + egress_cost + inter_provider_cost
    cost_per_epoch = total_cost / max(1, epochs)

    breakdown = {
        "compute_cost": compute_cost,
        "egress_cost": egress_cost,
        "inter_provider_cost": inter_provider_cost,
        "total_time_hours": total_time_hours,
        "derived_time_hours": derived_hours,
        "compute_time_per_step_sec": compute_time_per_step,
        "comm_time_per_step_sec": comm_time_per_step,
        "steps_per_epoch": steps_per_epoch,
        "total_steps": total_steps,
        "cost_per_epoch": cost_per_epoch,
        "egress_rate_source": source_rate,
        "egress_rate_by_provider": egress_rate_by_provider,
        "pairwise_costs": pairwise_costs,
        "model_size_gb": model_size,
        "dataset_size_gb": dataset_size_gb,
    }

    return placement, total_cost, forbidden, breakdown
