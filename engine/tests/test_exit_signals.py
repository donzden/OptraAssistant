"""
OP-44: Unit tests for exit rule evaluator and adjustment suggestion engine.
"""
import pytest
from app.services.exit_signals import evaluate_rules, get_adjustment_suggestion, _fallback_suggestion


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_snapshot(net_pnl=0.0, net_delta=0.0, net_theta=-5.0, net_vega=10.0):
    return {
        "net_pnl": net_pnl,
        "net_delta": net_delta,
        "net_theta": net_theta,
        "net_vega": net_vega,
        "legs": [],
    }


def pnl_pct_rule(threshold=50, net_premium=10000):
    return {
        "id": "r1",
        "type": "pnl_pct",
        "threshold": threshold,
        "label": f"Exit if loss > {threshold}%",
        "netPremium": net_premium,
    }


def pnl_abs_rule(threshold=5000):
    return {"id": "r2", "type": "pnl_abs", "threshold": threshold, "label": f"Exit if loss > ₹{threshold}"}


def delta_rule(threshold=0.4):
    return {"id": "r3", "type": "delta", "threshold": threshold, "label": f"Exit if |delta| > {threshold}"}


def dte_rule(threshold=3):
    return {"id": "r4", "type": "dte", "threshold": threshold, "label": f"Exit at {threshold} DTE"}


# ── pnl_pct rule ──────────────────────────────────────────────────────────────

class TestPnlPctRule:
    def test_fires_when_loss_exceeds_threshold(self):
        # 10000 premium, -6000 pnl = -60%, threshold 50% → should trigger
        snap = make_snapshot(net_pnl=-6000)
        triggered = evaluate_rules(snap, [pnl_pct_rule(50, 10000)], "2030-12-31")
        assert len(triggered) == 1
        assert triggered[0]["ruleType"] == "pnl_pct"

    def test_does_not_fire_before_threshold(self):
        # -3000 pnl on 10000 premium = -30%, threshold 50% → should NOT trigger
        snap = make_snapshot(net_pnl=-3000)
        triggered = evaluate_rules(snap, [pnl_pct_rule(50, 10000)], "2030-12-31")
        assert len(triggered) == 0

    def test_fires_exactly_at_boundary(self):
        # Exactly -50% → should trigger
        snap = make_snapshot(net_pnl=-5000)
        triggered = evaluate_rules(snap, [pnl_pct_rule(50, 10000)], "2030-12-31")
        assert len(triggered) == 1

    def test_does_not_fire_for_positive_pnl(self):
        snap = make_snapshot(net_pnl=1000)
        triggered = evaluate_rules(snap, [pnl_pct_rule(50, 10000)], "2030-12-31")
        assert len(triggered) == 0

    def test_skipped_when_net_premium_zero(self):
        rule = pnl_pct_rule(50, 0)
        snap = make_snapshot(net_pnl=-99999)
        triggered = evaluate_rules(snap, [rule], "2030-12-31")
        assert len(triggered) == 0


# ── pnl_abs rule ──────────────────────────────────────────────────────────────

class TestPnlAbsRule:
    def test_fires_when_loss_exceeds_threshold(self):
        snap = make_snapshot(net_pnl=-6000)
        triggered = evaluate_rules(snap, [pnl_abs_rule(5000)], "2030-12-31")
        assert len(triggered) == 1
        assert triggered[0]["ruleType"] == "pnl_abs"

    def test_does_not_fire_when_within_threshold(self):
        snap = make_snapshot(net_pnl=-4000)
        triggered = evaluate_rules(snap, [pnl_abs_rule(5000)], "2030-12-31")
        assert len(triggered) == 0

    def test_does_not_fire_for_profit(self):
        snap = make_snapshot(net_pnl=500)
        triggered = evaluate_rules(snap, [pnl_abs_rule(5000)], "2030-12-31")
        assert len(triggered) == 0


# ── delta rule ────────────────────────────────────────────────────────────────

class TestDeltaRule:
    def test_fires_when_delta_exceeds_threshold(self):
        snap = make_snapshot(net_delta=0.5)
        triggered = evaluate_rules(snap, [delta_rule(0.4)], "2030-12-31")
        assert len(triggered) == 1
        assert triggered[0]["ruleType"] == "delta"

    def test_fires_for_negative_delta_beyond_threshold(self):
        snap = make_snapshot(net_delta=-0.5)
        triggered = evaluate_rules(snap, [delta_rule(0.4)], "2030-12-31")
        assert len(triggered) == 1

    def test_does_not_fire_when_delta_within_threshold(self):
        snap = make_snapshot(net_delta=0.3)
        triggered = evaluate_rules(snap, [delta_rule(0.4)], "2030-12-31")
        assert len(triggered) == 0

    def test_fires_exactly_at_boundary(self):
        snap = make_snapshot(net_delta=0.4)
        triggered = evaluate_rules(snap, [delta_rule(0.4)], "2030-12-31")
        # strict >, so 0.4 > 0.4 is False — should NOT fire
        assert len(triggered) == 0

    def test_fires_just_above_boundary(self):
        snap = make_snapshot(net_delta=0.401)
        triggered = evaluate_rules(snap, [delta_rule(0.4)], "2030-12-31")
        assert len(triggered) == 1


# ── dte rule ──────────────────────────────────────────────────────────────────

class TestDteRule:
    def test_fires_when_dte_at_or_below_threshold(self):
        snap = make_snapshot()
        # Use a past date (already expired) → DTE = 0
        triggered = evaluate_rules(snap, [dte_rule(3)], "2020-01-01")
        assert len(triggered) == 1
        assert triggered[0]["ruleType"] == "dte"

    def test_does_not_fire_when_dte_above_threshold(self):
        snap = make_snapshot()
        triggered = evaluate_rules(snap, [dte_rule(3)], "2030-12-31")
        assert len(triggered) == 0


# ── Multiple rules ────────────────────────────────────────────────────────────

class TestMultipleRules:
    def test_fires_only_matching_rules(self):
        snap = make_snapshot(net_pnl=-6000, net_delta=0.3)
        rules = [pnl_pct_rule(50, 10000), delta_rule(0.4)]
        triggered = evaluate_rules(snap, rules, "2030-12-31")
        assert len(triggered) == 1
        assert triggered[0]["ruleType"] == "pnl_pct"

    def test_fires_all_matching_rules(self):
        snap = make_snapshot(net_pnl=-6000, net_delta=0.5)
        rules = [pnl_pct_rule(50, 10000), delta_rule(0.4)]
        triggered = evaluate_rules(snap, rules, "2030-12-31")
        assert len(triggered) == 2

    def test_empty_rules_returns_empty(self):
        snap = make_snapshot(net_pnl=-99999, net_delta=99)
        assert evaluate_rules(snap, [], "2020-01-01") == []


# ── Adjustment suggestions ─────────────────────────────────────────────────────

class TestAdjustmentSuggestion:
    def test_delta_positive_suggests_put(self):
        snap = make_snapshot(net_delta=0.5)
        suggestion = _fallback_suggestion("delta", snap)
        assert "Put" in suggestion or "put" in suggestion.lower()

    def test_delta_negative_suggests_call(self):
        snap = make_snapshot(net_delta=-0.5)
        suggestion = _fallback_suggestion("delta", snap)
        assert "Call" in suggestion or "call" in suggestion.lower()

    def test_pnl_loss_suggests_close(self):
        snap = make_snapshot(net_pnl=-5000)
        suggestion = _fallback_suggestion("pnl_pct", snap)
        assert "close" in suggestion.lower() or "loss" in suggestion.lower()

    def test_dte_suggests_roll_or_close(self):
        snap = make_snapshot()
        suggestion = _fallback_suggestion("dte", snap)
        assert "roll" in suggestion.lower() or "close" in suggestion.lower() or "expiry" in suggestion.lower()

    def test_returns_string_without_api_key(self):
        snap = make_snapshot(net_delta=0.5)
        result = get_adjustment_suggestion("delta", "Exit if delta > 0.4", snap, "Iron Condor", anthropic_api_key="")
        assert isinstance(result, str)
        assert len(result) > 10


# ── Performance aggregation ───────────────────────────────────────────────────

class TestPerformanceAggregation:
    """Pure Python logic matching the frontend PerformancePage computations."""

    @staticmethod
    def aggregate(pnls):
        """Mirrors effectivePnl + stats logic from PerformancePage.tsx."""
        if not pnls:
            return {"total": 0, "win_rate": 0, "avg": 0, "best": None, "worst": None, "wins": 0, "losses": 0}
        wins = [p for p in pnls if p >= 0]
        losses = [p for p in pnls if p < 0]
        return {
            "total": sum(pnls),
            "win_rate": round(len(wins) / len(pnls) * 100),
            "avg": sum(pnls) / len(pnls),
            "best": max(pnls),
            "worst": min(pnls),
            "wins": len(wins),
            "losses": len(losses),
        }

    def test_win_rate_all_winners(self):
        stats = self.aggregate([1000, 2000, 500])
        assert stats["win_rate"] == 100

    def test_win_rate_all_losers(self):
        stats = self.aggregate([-1000, -500])
        assert stats["win_rate"] == 0

    def test_win_rate_mixed(self):
        stats = self.aggregate([1000, -500, 2000, -200])
        assert stats["win_rate"] == 50

    def test_total_pnl(self):
        stats = self.aggregate([1000, -500, 200])
        assert stats["total"] == 700

    def test_avg_pnl(self):
        stats = self.aggregate([900, 300, -300])
        assert abs(stats["avg"] - 300) < 0.01

    def test_best_trade(self):
        stats = self.aggregate([100, 5000, -200])
        assert stats["best"] == 5000

    def test_worst_trade(self):
        stats = self.aggregate([100, -1000, 500])
        assert stats["worst"] == -1000

    def test_empty_returns_zeros(self):
        stats = self.aggregate([])
        assert stats["total"] == 0
        assert stats["win_rate"] == 0
        assert stats["best"] is None

    def test_single_trade_win(self):
        stats = self.aggregate([3000])
        assert stats["win_rate"] == 100
        assert stats["wins"] == 1
        assert stats["losses"] == 0

    def test_win_loss_counts(self):
        stats = self.aggregate([500, -200, 800, -100, 300])
        assert stats["wins"] == 3
        assert stats["losses"] == 2


# ── CSV export structure ──────────────────────────────────────────────────────

class TestCsvExport:
    """Validate expected CSV structure (mirrors frontend exportCsv logic)."""

    EXPECTED_HEADERS = ["Strategy", "Instrument", "Entry Date", "Exit Date", "Holding Days", "Legs", "Final P&L (₹)"]

    @staticmethod
    def build_csv(rows):
        lines = [",".join(f'"{c}"' for c in row) for row in rows]
        return "\n".join(lines)

    def test_header_row_present(self):
        csv = self.build_csv([self.EXPECTED_HEADERS, ["Iron Condor", "NIFTY", "2026-05-01", "2026-05-20", "19", "4", "1500.00"]])
        lines = csv.split("\n")
        assert lines[0] == ",".join(f'"{h}"' for h in self.EXPECTED_HEADERS)

    def test_row_count_matches_input(self):
        trades = [
            ["Iron Condor", "NIFTY", "2026-05-01", "2026-05-20", "19", "4", "1500.00"],
            ["Bull Put Spread", "BANKNIFTY", "2026-05-10", "2026-05-22", "12", "2", "-800.00"],
            ["Long Straddle", "NIFTY", "2026-04-15", "2026-04-30", "15", "2", "3200.00"],
        ]
        csv = self.build_csv([self.EXPECTED_HEADERS] + trades)
        lines = csv.strip().split("\n")
        assert len(lines) == len(trades) + 1  # header + data rows

    def test_all_headers_present(self):
        csv = self.build_csv([self.EXPECTED_HEADERS])
        for header in self.EXPECTED_HEADERS:
            assert header in csv

    def test_values_are_quoted(self):
        csv = self.build_csv([self.EXPECTED_HEADERS, ["Iron Condor", "NIFTY", "2026-05-01", "2026-05-20", "19", "4", "1500.00"]])
        # Every value should be double-quoted
        for line in csv.split("\n"):
            assert all(cell.startswith('"') and cell.endswith('"') for cell in line.split(","))
