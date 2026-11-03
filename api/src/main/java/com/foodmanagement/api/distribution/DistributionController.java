package com.foodmanagement.api.distribution;

import com.foodmanagement.api.auth.CurrentUser;
import com.foodmanagement.api.distribution.PlannerClient.Pick;
import com.foodmanagement.api.distribution.PlannerClient.Plan;
import com.foodmanagement.api.distribution.PlannerClient.PlanLot;
import com.foodmanagement.api.distribution.PlannerClient.PlanRequest;
import com.foodmanagement.api.distribution.PlannerClient.Report;
import com.foodmanagement.api.distribution.PlannerClient.ReportMovement;
import com.foodmanagement.api.distribution.PlannerClient.ShortageJson;
import com.foodmanagement.api.stock.StockController;
import com.foodmanagement.api.stock.StockRepository;
import com.foodmanagement.api.stock.StockRepository.LotView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 配布の提案と確定、月次の報告。計算そのものは Python のサービスに任せ、
 * ここでは自分の団体の在庫と履歴を集めて渡し、確定は楽観的ロックとトランザクションで守る。
 */
@RestController
public class DistributionController {

    public record PlanBody(@NotNull @Min(1) @Max(10000) Integer households, @NotEmpty Map<String, Integer> perHousehold) {}

    /** 提案した在庫ごとに、そのときの version を付けて返す（確定するときに画面から送り返してもらう）。 */
    public record PlannedPick(
            long lotId,
            String itemName,
            String category,
            int quantity,
            String expiresOn,
            int daysLeft,
            String reason,
            int version) {}

    public record DistributionPlan(LocalDate today, List<PlannedPick> picks, List<ShortageJson> shortages) {}

    public record ConfirmPick(@NotNull Long lotId, @NotNull @Min(1) Integer quantity, @NotNull Integer version) {}

    public record ConfirmBody(@NotEmpty @Size(max = 500) List<@Valid ConfirmPick> picks) {}

    private final StockRepository repo;
    private final PlannerClient planner;
    private final Clock clock;

    public DistributionController(StockRepository repo, PlannerClient planner, Clock clock) {
        this.repo = repo;
        this.planner = planner;
        this.clock = clock;
    }

    @PostMapping("/api/distributions/plan")
    public DistributionPlan plan(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody PlanBody body) {
        for (var entry : body.perHousehold().entrySet()) {
            if (!entry.getKey().matches(StockController.CATEGORIES) || entry.getValue() == null
                    || entry.getValue() < 0 || entry.getValue() > 100) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "種類ごとの個数は0〜100にしてください");
            }
        }
        long org = user.organizationId();
        LocalDate today = LocalDate.now(clock);
        List<LotView> lots = repo.findAvailableLots(org);
        List<PlanLot> planLots = lots.stream()
                .map(l -> new PlanLot(
                        l.id(), l.itemName(), l.category(), l.quantity(), l.expiresOn(), l.expiryType(), l.receivedOn()))
                .toList();
        Plan plan = planner.plan(new PlanRequest(
                today, body.households(), body.perHousehold(), repo.includeExpiredBestBefore(org), planLots));

        Map<Long, Integer> versions = lots.stream().collect(Collectors.toMap(LotView::id, LotView::version));
        List<PlannedPick> picks = plan.picks().stream()
                .map((Function<Pick, PlannedPick>) p -> new PlannedPick(
                        p.lotId(),
                        p.itemName(),
                        p.category(),
                        p.quantity(),
                        p.expiresOn(),
                        p.daysLeft(),
                        p.reason(),
                        versions.getOrDefault(p.lotId(), 0)))
                .toList();
        return new DistributionPlan(today, picks, plan.shortages());
    }

    /**
     * 配布の確定。すべての在庫を 1 つのトランザクションで減らし、どれか 1 つでも
     * 他のスタッフに先に更新されていたら（409）、全部取り消して何も変えない。
     */
    @PostMapping("/api/distributions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void confirm(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody ConfirmBody body) {
        long org = user.organizationId();
        LocalDate today = LocalDate.now(clock);
        for (ConfirmPick pick : body.picks()) {
            StockController.decreaseOrThrow(repo, org, pick.lotId(), pick.quantity(), pick.version());
            repo.insertMovement(org, pick.lotId(), "distribute", pick.quantity(), user.userId(), today, null);
        }
    }

    @GetMapping("/api/reports/monthly")
    public Report monthly(
            @AuthenticationPrincipal CurrentUser user,
            @RequestParam @Pattern(regexp = "\\d{4}-\\d{2}", message = "月は 2026-10 の形で指定してください") String month) {
        YearMonth ym = YearMonth.parse(month);
        List<ReportMovement> movements = repo.findMovements(
                        user.organizationId(), ym.atDay(1), ym.plusMonths(1).atDay(1))
                .stream()
                .map(m -> new ReportMovement(m.kind(), m.category(), m.quantity(), m.occurredOn()))
                .toList();
        return planner.report(month, movements);
    }
}
