-- ================================================================
-- Migration v11: Atomic cash session totals update
-- Replaces the read-modify-write pattern in updateSessionTotals()
-- with a single UPDATE that avoids race conditions.
-- ================================================================

CREATE OR REPLACE FUNCTION update_session_totals(
    p_session_id  UUID,
    p_type        TEXT,          -- 'sale' | 'expense' | 'withdrawal' | 'deposit'
    p_amount      NUMERIC,
    p_method      TEXT,          -- 'cash' | 'card' | 'transfer' | other
    p_reverse     BOOLEAN DEFAULT FALSE  -- TRUE to subtract instead of add
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sign NUMERIC := CASE WHEN p_reverse THEN -1 ELSE 1 END;
BEGIN
    IF p_type = 'sale' THEN
        UPDATE cash_sessions
        SET
            total_sales    = GREATEST(0, total_sales    + v_sign * p_amount),
            total_cash     = GREATEST(0, total_cash     + CASE WHEN p_method = 'cash'     THEN v_sign * p_amount ELSE 0 END),
            total_card     = GREATEST(0, total_card     + CASE WHEN p_method = 'card'     THEN v_sign * p_amount ELSE 0 END),
            total_transfer = GREATEST(0, total_transfer + CASE WHEN p_method = 'transfer' THEN v_sign * p_amount ELSE 0 END)
        WHERE id = p_session_id;

    ELSIF p_type IN ('expense', 'withdrawal') THEN
        UPDATE cash_sessions
        SET total_expenses = GREATEST(0, total_expenses + v_sign * p_amount)
        WHERE id = p_session_id;

    ELSIF p_type = 'deposit' THEN
        UPDATE cash_sessions
        SET total_cash = GREATEST(0, total_cash + v_sign * p_amount)
        WHERE id = p_session_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_session_totals TO service_role;
