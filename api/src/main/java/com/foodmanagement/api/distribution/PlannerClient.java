package com.foodmanagement.api.distribution;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Python の計算サービスへの窓口。テストではこのインターフェースを差し替える。 */
public interface PlannerClient {

    Plan plan(PlanRequest request);

    Report report(String month, List<ReportMovement> movements);

    record PlanLot(
            long id,
            String itemName,
            String category,
            int quantity,
            LocalDate expiresOn,
            String expiryType,
            LocalDate receivedOn) {}

    record PlanRequest(
            LocalDate today,
            int households,
            Map<String, Integer> perHousehold,
            boolean includeExpiredBestBefore,
            List<PlanLot> lots) {}

    record Pick(
            long lotId, String itemName, String category, int quantity, String expiresOn, int daysLeft, String reason) {}

    record Plan(List<Pick> picks, List<ShortageJson> shortages) {}

    /** 足りない数。JSON では short という名前（Java では予約語なので shortCount で受け取る）。 */
    record ShortageJson(
            String category, int needed, int available, @JsonProperty("short") int shortCount) {}

    record ReportMovement(String kind, String category, int quantity, LocalDate occurredOn) {}

    record ReportRow(String category, int received, int distributed, int disposed) {}

    record Totals(int received, int distributed, int disposed) {}

    record Report(String month, List<ReportRow> rows, Totals total) {}
}
