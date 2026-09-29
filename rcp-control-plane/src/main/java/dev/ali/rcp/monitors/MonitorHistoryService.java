package dev.ali.rcp.monitors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class MonitorHistoryService {
    private static final Duration REGION_WINDOW = Duration.ofHours(24);
    private static final int RECENT_CHECK_LIMIT = 12;

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
}
