package dev.ali.rcp.availability;

public record VerdictCounts(
        long up,
        long down,
        long disagreement,
        long noData,
        long pending
) {
    public VerdictCounts {
        if (up < 0 || down < 0 || disagreement < 0 || noData < 0 || pending < 0) {
            throw new IllegalArgumentException("verdict counts must not be negative");
        }
    }

    public long conclusive() {
        return up + down;
    }

    public long inconclusive() {
        return disagreement + noData;
    }

    public long total() {
        return conclusive() + inconclusive();
    }

    public long totalCreated() {
        return total() + pending;
    }
}
