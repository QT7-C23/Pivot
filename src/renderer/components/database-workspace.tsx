import { Database } from 'lucide-react'
import type { ReactElement } from 'react'

export function DatabaseWorkspace(): ReactElement {
  return (
    <section className="pv-database-workspace" data-figma-screen="1506:9442">
      <header><h1>Database</h1></header>
      <div className="pv-database-empty">
        <Database aria-hidden="true" size={28} strokeWidth={1.4} />
        <h2>Under Construction</h2>
        <p>The database module is being developed. Pivot will not display invented connections, schemas, or query results.</p>
        <span>Coming in v2.0</span>
        <div><strong>Planned capabilities</strong><small>Query editor and schema browser</small><small>Table visualization and relations</small><small>Migration management</small><small>Connection pooling and monitoring</small></div>
      </div>
    </section>
  )
}
