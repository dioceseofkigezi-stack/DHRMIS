-- Each DHRMIS installation represents one Diocese. Keep a single root record
-- while retaining the hierarchy beneath it (archdeaconries, parishes, etc.).
CREATE UNIQUE INDEX IF NOT EXISTS dioceses_single_row_per_installation
  ON public.dioceses ((TRUE));
