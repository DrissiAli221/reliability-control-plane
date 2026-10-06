package dev.ali.rcp.monitors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.Objects;
import java.util.UUID;

@Service
public class MonitorHistoryService {
    private static final Duration REGION_WINDOW = Duration.ofHours(24);
    private static final int RECENT_CHECK_LIMIT = 30;
    static final int HEATMAP_COLUMNS = 48;
    // Doubling bands keep fast and slow responses readable on one axis.
    static final List<Long> LATENCY_BOUNDS_MS = List.of(50L, 100L, 200L, 400L, 800L, 1_600L, 3_200L);

    private final MonitorRepository monitorRepository;
    private final MonitorHistoryRepository historyRepository;

    public MonitorHistoryService(MonitorRepository monitorRepository, MonitorHistoryRepository historyRepository) {
        this.monitorRepository = Objects.requireNonNull(monitorRepository);
        this.historyRepository = Objects.requireNonNull(historyRepository);
    }

    @Transactional(readOnly = true)
    public MonitorHistory forOwner(String ownerSubject, UUID monitorId, int days) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        monitorRepository.findByIdAndOwnerSubject(monitorId, ownerSubject)
                .orElseThrow(MonitorNotFoundException::new);

        // Day buckets and the 24-hour region window follow PostgreSQL time, like the scheduler.
        Instant now = historyRepository.databaseNow();
        LocalDate today = now.atOffset(ZoneOffset.UTC).toLocalDate();
        List<DailyEvidence> dailyEvidence = historyRepository
                .dailyEvidence(List.of(monitorId), today.minusDays(days - 1L), today)
                .getOrDefault(monitorId, List.of());

        return new MonitorHistory(
                monitorId,
                now,
                dailyEvidence,
                historyRepository.regionSummaries(monitorId, now.minus(REGION_WINDOW)),
                historyRepository.recentChecks(monitorId, RECENT_CHECK_LIMIT)
        );
    }

    @Transactional(readOnly = true)
    public LatencyHeatmap latencyHeatmap(String ownerSubject, UUID monitorId, int hours) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        monitorRepository.findByIdAndOwnerSubject(monitorId, ownerSubject)
                .orElseThrow(MonitorNotFoundException::new);

        int bucketSeconds = hours * 3600 / HEATMAP_COLUMNS;
        Instant to = historyRepository.databaseNow();
        Instant from = to.minusSeconds((long) bucketSeconds * HEATMAP_COLUMNS);
        Map<String, List<List<Long>>> byRegion = new TreeMap<>();
        for (MonitorHistoryRepository.LatencyCell cell
                : historyRepository.latencyCells(monitorId, from, to, bucketSeconds, LATENCY_BOUNDS_MS)) {
            List<List<Long>> grid = byRegion.computeIfAbsent(cell.region(), region -> emptyGrid());
            grid.get(Math.min(cell.column(), HEATMAP_COLUMNS - 1)).set(cell.band(), cell.samples());
        }

        Map<String, Long[]> p50ByRegion = new TreeMap<>();
        Map<String, Long[]> p95ByRegion = new TreeMap<>();
        for (MonitorHistoryRepository.ColumnPercentiles column
                : historyRepository.latencyPercentiles(monitorId, from, to, bucketSeconds)) {
            int index = Math.min(column.column(), HEATMAP_COLUMNS - 1);
            p50ByRegion.computeIfAbsent(column.region(), region -> new Long[HEATMAP_COLUMNS])[index] = column.p50Ms();
            p95ByRegion.computeIfAbsent(column.region(), region -> new Long[HEATMAP_COLUMNS])[index] = column.p95Ms();
        }

        List<LatencyHeatmap.RegionHeatmap> regions = byRegion.entrySet().stream()
                .map(entry -> new LatencyHeatmap.RegionHeatmap(
                        entry.getKey(),
                        entry.getValue().stream().flatMap(List::stream).mapToLong(Long::longValue).sum(),
                        entry.getValue().stream().map(List::copyOf).toList(),
                        nullableColumns(p50ByRegion.get(entry.getKey())),
                        nullableColumns(p95ByRegion.get(entry.getKey()))
                ))
                .toList();
        return new LatencyHeatmap(monitorId, from, to, bucketSeconds, LATENCY_BOUNDS_MS, regions);
    }

    /** Columns without an HTTP response stay null; List.copyOf would reject them. */
    private static List<Long> nullableColumns(Long[] columns) {
        return Collections.unmodifiableList(Arrays.asList(columns == null ? new Long[HEATMAP_COLUMNS] : columns));
    }

    private static List<List<Long>> emptyGrid() {
        List<List<Long>> grid = new ArrayList<>(HEATMAP_COLUMNS);
        for (int column = 0; column < HEATMAP_COLUMNS; column++) {
            grid.add(new ArrayList<>(Collections.nCopies(LATENCY_BOUNDS_MS.size() + 1, 0L)));
        }
        return grid;
    }
}
