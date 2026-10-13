package dev.ali.rcp.monitors;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;

/** NULL means the default 200..399; an explicit set replaces that default. */
public final class AcceptedHttpStatuses {
    private AcceptedHttpStatuses() { }

    public static List<Integer> normalize(List<Integer> codes) {
        if (codes == null) return null;
        if (codes.isEmpty() || codes.size() > 500 || codes.stream().anyMatch(code -> code == null || code < 100 || code > 599))
            throw new IllegalArgumentException("Accepted statuses must contain 1–500 HTTP codes between 100 and 599");
        List<Integer> sorted = codes.stream().distinct().sorted().toList();
        if (sorted.size() == 200 && sorted.getFirst() == 200 && sorted.getLast() == 399) return null;
        return sorted;
    }

    public static List<Integer> read(ResultSet row, String column) throws SQLException {
        java.sql.Array array = row.getArray(column);
        if (array == null) return null;
        try { return List.copyOf(Arrays.asList((Integer[]) array.getArray())); }
        finally { array.free(); }
    }

    // Bound as a parameter, never interpolated into SQL.
    public static String databaseValue(List<Integer> codes) {
        return codes == null ? null : "{" + String.join(",", codes.stream().map(String::valueOf).toList()) + "}";
    }
}
