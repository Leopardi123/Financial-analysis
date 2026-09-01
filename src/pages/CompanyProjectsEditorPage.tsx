import CompanyProjectsEditorPageLegacy from './CompanyProjectsEditorPageLegacy.tsx';
import CompanyProjectsEditorV3Page from './CompanyProjectsEditorV3Page.tsx';

function switchEditor(format: 'v2' | 'v3'): void {
  const url = new URL(window.location.href);
  if (format === 'v3') url.searchParams.set('format', 'v3');
  else url.searchParams.delete('format');
  window.location.assign(url.toString());
}

export default function CompanyProjectsEditorPage() {
  const format = new URLSearchParams(window.location.search).get('format') === 'v3' ? 'v3' : 'v2';
  return (
    <>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center', borderBottom: '1px solid rgba(127,127,127,0.25)' }}>
        <strong>Project JSON editor:</strong>
        <button type="button" disabled={format === 'v2'} onClick={() => switchEditor('v2')}>Legacy v2</button>
        <button type="button" disabled={format === 'v3'} onClick={() => switchEditor('v3')}>Canonical v3</button>
        <span style={{ opacity: 0.7 }}>V2 projects remain unchanged; V3 migration is explicit and report-by-report.</span>
      </div>
      {format === 'v3' ? <CompanyProjectsEditorV3Page /> : <CompanyProjectsEditorPageLegacy />}
    </>
  );
}
