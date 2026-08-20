import { Copy, Download, FileCode2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { FileReviewRecord, FileReviewResolution } from '../../shared/types/domain'
import { CodeDiffEditor } from './CodeDiffEditor'

export function FileReviewWorkspace({
  review,
}: {
  review: FileReviewRecord
  resolveReview: (resolution: FileReviewResolution) => Promise<void>
}): ReactElement {
  return (
    <section className="pv-artifact-review-workspace" data-figma-screen="64:822">
      <header className="pv-artifact-toolbar">
        <div><FileCode2 aria-hidden="true" size={15} /><strong>{fileName(review.filePath)}</strong><span>{fileType(review.filePath)}</span></div>
        <div>
          <button onClick={() => void navigator.clipboard.writeText(review.currentContent)} type="button"><Copy size={13} />Copy</button>
          <button onClick={() => downloadReview(review)} type="button"><Download size={13} />Download</button>
        </div>
      </header>
      <div className="pv-diff-modebar">
        <strong>{fileName(review.filePath)}</strong>
        <span>{review.status}</span>
        <div><button className="active" type="button">Split</button><button disabled type="button">Unified</button><button disabled type="button">Raw</button></div>
      </div>
      <CodeDiffEditor filePath={review.filePath} modified={review.currentContent} original={review.originalContent} />
    </section>
  )
}

function fileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path }
function fileType(path: string): string { return path.split('.').at(-1)?.toUpperCase() ?? 'FILE' }

function downloadReview(review: FileReviewRecord): void {
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(new Blob([review.currentContent], { type: 'text/plain;charset=utf-8' }))
  anchor.download = fileName(review.filePath)
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}
