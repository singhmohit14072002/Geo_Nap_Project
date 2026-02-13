def communication_time(model_size_gb, bandwidth_gbps, rtt_ms):
    return (model_size_gb / bandwidth_gbps) + (rtt_ms / 1000)
