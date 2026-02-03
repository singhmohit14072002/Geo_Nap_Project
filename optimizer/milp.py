from pulp import *

def solve_geo_nap(providers, gpu_price, egress_price,
                  required_gpus, forbidden,
                  model_size_gb, steps, capacity):

    model = LpProblem("GeoNAP", LpMinimize)

    x = LpVariable.dicts("GPUs", providers, lowBound=0, cat="Integer")

    compute = lpSum(x[p] * gpu_price[p] for p in providers)
    network = lpSum(x[p] * model_size_gb * steps * egress_price[p]
                    for p in providers)

    model += compute + network
    model += lpSum(x[p] for p in providers) == required_gpus

    # Forbidden providers
    for p in forbidden:
        model += x[p] == 0

    # Capacity constraints
    for p in providers:
        model += x[p] <= capacity[p]

    model.solve()

    placement = {p: int(x[p].value()) for p in providers}
    return placement, value(model.objective)
    