def compute_cost(gpus, price, hours):
    return gpus * price * hours

def network_cost(data_gb, egress):
    return data_gb * egress
