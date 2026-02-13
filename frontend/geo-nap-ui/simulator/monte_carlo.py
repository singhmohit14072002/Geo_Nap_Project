import numpy as np

def monte_carlo_samples(mean, runs=500):
    return np.random.normal(mean, mean*0.2, runs)
