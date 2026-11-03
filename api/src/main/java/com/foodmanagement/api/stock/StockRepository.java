package com.foodmanagement.api.stock;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** 商品・在庫・入出庫履歴の読み書き。どの SQL も organization_id で絞り込み、他の団体のデータには触れない。 */
@Repository
public class StockRepository {

    public record Item(String jan, String name, String category) {}

    public record LotView(
            long id,
            String itemName,
            String category,
            String jan,
            int quantity,
            LocalDate expiresOn,
            String expiryType,
            LocalDate receivedOn,
            String donor,
            int version) {}

    public record MovementView(String kind, String category, int quantity, LocalDate occurredOn) {}

    private static final String LOT_SELECT = """
            SELECT l.id, i.name AS item_name, i.category, i.jan, l.quantity, l.expires_on, l.expiry_type,
                   l.received_on, l.donor, l.version
            FROM lots l JOIN items i ON i.id = l.item_id
            """;

    private final JdbcClient db;

    public StockRepository(JdbcClient db) {
        this.db = db;
    }

    public Optional<Item> findItemByJan(long org, String jan) {
        return db.sql("SELECT jan, name, category FROM items WHERE organization_id = :org AND jan = :jan")
                .param("org", org)
                .param("jan", jan)
                .query(Item.class)
                .optional();
    }

    /** JAN があれば団体の中で 1 つの商品にまとめ（名前と種類は最新の入力で更新）、なければ名前と種類で探す。 */
    public long upsertItem(long org, String jan, String name, String category) {
        if (jan != null) {
            return db.sql("""
                            INSERT INTO items (organization_id, jan, name, category) VALUES (:org, :jan, :name, :category)
                            ON CONFLICT (organization_id, jan) WHERE jan IS NOT NULL
                            DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
                            RETURNING id""")
                    .param("org", org)
                    .param("jan", jan)
                    .param("name", name)
                    .param("category", category)
                    .query(Long.class)
                    .single();
        }
        return db.sql("""
                        SELECT id FROM items
                        WHERE organization_id = :org AND jan IS NULL AND name = :name AND category = :category
                        ORDER BY id LIMIT 1""")
                .param("org", org)
                .param("name", name)
                .param("category", category)
                .query(Long.class)
                .optional()
                .orElseGet(() -> db.sql("""
                                INSERT INTO items (organization_id, name, category) VALUES (:org, :name, :category)
                                RETURNING id""")
                        .param("org", org)
                        .param("name", name)
                        .param("category", category)
                        .query(Long.class)
                        .single());
    }

    public long insertLot(
            long org,
            long itemId,
            int quantity,
            LocalDate expiresOn,
            String expiryType,
            LocalDate receivedOn,
            String donor) {
        return db.sql("""
                        INSERT INTO lots (organization_id, item_id, quantity, expires_on, expiry_type, received_on, donor)
                        VALUES (:org, :item, :quantity, :expires, :type, :received, :donor) RETURNING id""")
                .param("org", org)
                .param("item", itemId)
                .param("quantity", quantity)
                .param("expires", expiresOn)
                .param("type", expiryType)
                .param("received", receivedOn)
                .param("donor", donor)
                .query(Long.class)
                .single();
    }

    /** 数量が 1 以上の在庫を、期限の早い順（同じなら入荷の早い順）に返す。 */
    public List<LotView> findAvailableLots(long org) {
        return db.sql(LOT_SELECT + """
                        WHERE l.organization_id = :org AND l.quantity > 0
                        ORDER BY l.expires_on, l.received_on, l.id""")
                .param("org", org)
                .query(LotView.class)
                .list();
    }

    public Optional<LotView> findLot(long org, long lotId) {
        return db.sql(LOT_SELECT + "WHERE l.organization_id = :org AND l.id = :id")
                .param("org", org)
                .param("id", lotId)
                .query(LotView.class)
                .optional();
    }

    /**
     * 楽観的ロックで在庫を減らす。見ていた version が今と同じで、在庫が足りるときだけ更新する。
     *
     * @return 更新できたら true。他のスタッフが先に更新したか在庫が足りなければ false
     */
    public boolean decrease(long org, long lotId, int quantity, int expectedVersion) {
        return db.sql("""
                        UPDATE lots SET quantity = quantity - :quantity, version = version + 1
                        WHERE organization_id = :org AND id = :id AND version = :version AND quantity >= :quantity""")
                        .param("quantity", quantity)
                        .param("org", org)
                        .param("id", lotId)
                        .param("version", expectedVersion)
                        .update()
                == 1;
    }

    public void insertMovement(
            long org, long lotId, String kind, int quantity, long userId, LocalDate occurredOn, String note) {
        db.sql("""
                        INSERT INTO movements (organization_id, lot_id, kind, quantity, user_id, occurred_on, note)
                        VALUES (:org, :lot, :kind, :quantity, :user, :occurred, :note)""")
                .param("org", org)
                .param("lot", lotId)
                .param("kind", kind)
                .param("quantity", quantity)
                .param("user", userId)
                .param("occurred", occurredOn)
                .param("note", note)
                .update();
    }

    public List<MovementView> findMovements(long org, LocalDate from, LocalDate toExclusive) {
        return db.sql("""
                        SELECT m.kind, i.category, m.quantity, m.occurred_on
                        FROM movements m JOIN lots l ON l.id = m.lot_id JOIN items i ON i.id = l.item_id
                        WHERE m.organization_id = :org AND m.occurred_on >= :from AND m.occurred_on < :to
                        ORDER BY m.occurred_on, m.id""")
                .param("org", org)
                .param("from", from)
                .param("to", toExclusive)
                .query(MovementView.class)
                .list();
    }

    public boolean includeExpiredBestBefore(long org) {
        return db.sql("SELECT include_expired_best_before FROM organizations WHERE id = :org")
                .param("org", org)
                .query(Boolean.class)
                .single();
    }
}
