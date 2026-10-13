"""Version 1 of the UTC drill schedule; mirrored by rcp-dashboard/src/drill.ts."""
CYCLE_MS = 7_200_000
MODES = ("outage", "slow", "regional", "blip")


def plan(cycle_start_ms):
    if cycle_start_ms % CYCLE_MS:
        raise ValueError("Expected an aligned two-hour UTC cycle")
    state = ((cycle_start_ms // CYCLE_MS) ^ 0x52435031) & 0xFFFFFFFF
    state = state or 1

    def draw():
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        return state

    skipped = draw() % 4 == 0
    mode = MODES[draw() % 4]
    # Leave five minutes at each edge, even for the longest drill.
    offset_ms = (5 + draw() % 91) * 60_000
    duration_ms = (4 + draw() % 17) * 60_000
    if mode == "blip":
        duration_ms = (15 + draw() % 26) * 1000
    delay_ms = 2000 + draw() % 1501
    failed_region = ("eu-west-1", "us-east-1")[draw() % 2]
    start = cycle_start_ms + offset_ms
    return {"cycleStart": cycle_start_ms, "start": start, "end": start + duration_ms,
            "mode": mode, "skipped": skipped, "delayMs": delay_ms, "failedRegion": failed_region}


def active_plan(now_ms):
    candidate = plan((now_ms // CYCLE_MS) * CYCLE_MS)
    return candidate if not candidate["skipped"] and candidate["start"] <= now_ms < candidate["end"] else None
