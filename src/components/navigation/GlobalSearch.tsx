import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { searchAuthorizedRecords, type SearchResult } from "@/core/search/search";
import { useAuth } from "@/modules/core/auth/context";
import { getWorkspaceDomain, getWorkspaceFromPath, workspacePath } from "@/core/organizational-scope/workspaces";

export default function GlobalSearch() {
  const { roles, personnelDomains, workspaceDomainCodes } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = getWorkspaceFromPath(location.pathname, location.search);
  const activeDomain = workspace && workspaceDomainCodes.includes(workspace.code)
    ? getWorkspaceDomain(workspace, personnelDomains)
    : workspaceDomainCodes.length === 1
      ? personnelDomains.find((domain) => domain.code === workspaceDomainCodes[0])
      : undefined;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void searchAuthorizedRecords(term, roles, activeDomain?.id).then((nextResults) => {
        if (active) setResults(nextResults);
      }).catch(() => {
        if (active) {
          setResults([]);
          setError("Search is temporarily unavailable. Try again shortly.");
        }
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, roles, activeDomain?.id]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function openResult(result: SearchResult) {
    setOpen(false);
    setQuery("");
    navigate(workspace ? workspacePath(result.path, workspace.slug) : result.path);
  }

  return (
    <div className="global-search" ref={container}>
      <label className="global-search-input">
        <Icon name="search" size={17} />
        <input
          type="search"
          value={query}
          placeholder="Search authorized records"
          aria-label="Search employees, assignments and documents"
          aria-controls="global-search-results"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results[0]) openResult(results[0]);
          }}
        />
        {loading && <span className="loading-spinner search-spinner" aria-label="Searching" />}
      </label>
      {open && query.trim().length >= 2 && (
        <div className="search-results" id="global-search-results" role="listbox" aria-label="Search results">
          {error ? <p className="search-message" role="status">{error}</p> : null}
          {!error && !loading && results.length === 0 && <p className="search-message">No matching records found.</p>}
          {results.map((result) => (
            <button type="button" className="search-result" role="option" aria-selected="false" key={`${result.kind}-${result.id}`} onClick={() => openResult(result)}>
              <span className="search-result-kind">{result.kind}</span>
              <span className="search-result-copy"><strong>{result.title || "Unnamed record"}</strong><small>{result.detail}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
