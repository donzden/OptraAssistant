import math
from scipy.stats import norm


def calculate_greeks(spot: float, strike: float, t: float, sigma: float, r: float, option_type: str = "CE") -> dict:
    if t <= 0:
        intrinsic = max(spot - strike, 0) if option_type == "CE" else max(strike - spot, 0)
        return {"delta": 1.0 if intrinsic > 0 else 0.0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0, "price": intrinsic}

    d1 = (math.log(spot / strike) + (r + 0.5 * sigma ** 2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)

    if option_type == "CE":
        price = spot * norm.cdf(d1) - strike * math.exp(-r * t) * norm.cdf(d2)
        delta = norm.cdf(d1)
        rho = strike * t * math.exp(-r * t) * norm.cdf(d2) / 100
    else:
        price = strike * math.exp(-r * t) * norm.cdf(-d2) - spot * norm.cdf(-d1)
        delta = norm.cdf(d1) - 1
        rho = -strike * t * math.exp(-r * t) * norm.cdf(-d2) / 100

    gamma = norm.pdf(d1) / (spot * sigma * math.sqrt(t))
    theta = (-(spot * norm.pdf(d1) * sigma) / (2 * math.sqrt(t)) - r * strike * math.exp(-r * t) * norm.cdf(d2 if option_type == "CE" else -d2)) / 365
    vega = spot * math.sqrt(t) * norm.pdf(d1) / 100

    return {
        "price": round(price, 2),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 4),
        "vega": round(vega, 4),
        "rho": round(rho, 4),
    }
