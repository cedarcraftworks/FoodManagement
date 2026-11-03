package com.foodmanagement.api.stock;

import com.foodmanagement.api.auth.CurrentUser;
import com.foodmanagement.api.stock.StockRepository.Item;
import com.foodmanagement.api.stock.StockRepository.LotView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 在庫の一覧、入荷の登録、廃棄の記録、バーコードからの商品の検索。 */
@RestController
public class StockController {

    public static final String CATEGORIES = "staple|retort|canned|seasoning|snack|drink|fresh|other";

    public record NewLot(
            @Pattern(regexp = "\\d{8}|\\d{13}", message = "バーコードの番号は8桁か13桁です") String jan,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = CATEGORIES) String category,
            @NotNull @Min(1) @Max(100000) Integer quantity,
            @NotNull LocalDate expiresOn,
            @NotBlank @Pattern(regexp = "best_before|use_by") String expiryType,
            @Size(max = 200) String donor) {}

    public record Dispose(
            @NotNull @Min(1) Integer quantity, @NotNull Integer version, @Size(max = 500) String reason) {}

    private final StockRepository repo;
    private final Clock clock;

    public StockController(StockRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @GetMapping("/api/lots")
    public List<LotView> lots(@AuthenticationPrincipal CurrentUser user) {
        return repo.findAvailableLots(user.organizationId());
    }

    @GetMapping("/api/items/by-jan/{jan}")
    public Item itemByJan(@AuthenticationPrincipal CurrentUser user, @PathVariable String jan) {
        return repo.findItemByJan(user.organizationId(), jan)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "登録されていない商品です"));
    }

    /** 入荷：商品をまとめ、在庫を作り、受入の履歴を残す（すべて 1 つのトランザクション）。 */
    @PostMapping("/api/lots")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public LotView receive(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody NewLot body) {
        String jan = blankToNull(body.jan());
        if (jan != null && !Jan.isValid(jan)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "バーコードの番号が正しくありません（最後の1桁が合いません）");
        }
        long org = user.organizationId();
        LocalDate today = LocalDate.now(clock);
        long itemId = repo.upsertItem(org, jan, body.name().trim(), body.category());
        long lotId = repo.insertLot(
                org, itemId, body.quantity(), body.expiresOn(), body.expiryType(), today, blankToNull(body.donor()));
        repo.insertMovement(org, lotId, "receive", body.quantity(), user.userId(), today, null);
        return repo.findLot(org, lotId).orElseThrow();
    }

    /** 廃棄：楽観的ロックで在庫を減らし、廃棄の履歴を残す。 */
    @PostMapping("/api/lots/{id}/dispose")
    @Transactional
    public LotView dispose(
            @AuthenticationPrincipal CurrentUser user, @PathVariable long id, @Valid @RequestBody Dispose body) {
        long org = user.organizationId();
        decreaseOrThrow(repo, org, id, body.quantity(), body.version());
        repo.insertMovement(org, id, "dispose", body.quantity(), user.userId(), LocalDate.now(clock), blankToNull(body.reason()));
        return repo.findLot(org, id).orElseThrow();
    }

    /** 在庫を減らせなかったとき、理由に合わせて 404 か 409 を返す。配布の確定でも使う。 */
    public static void decreaseOrThrow(StockRepository repo, long org, long lotId, int quantity, int version) {
        if (repo.decrease(org, lotId, quantity, version)) {
            return;
        }
        LotView lot = repo.findLot(org, lotId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "在庫が見つかりません"));
        if (lot.version() != version) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "他のスタッフが先に「" + lot.itemName() + "」を更新しました。最新の在庫で確認してください");
        }
        throw new ResponseStatusException(
                HttpStatus.CONFLICT, "「" + lot.itemName() + "」の在庫が足りません（残り " + lot.quantity() + " 個）");
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
