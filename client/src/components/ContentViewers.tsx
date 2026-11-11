import { useEffect, useRef, useState } from 'react'
import type { PresentationSlide, StoredFile } from '../types'
import { getFileContent } from '../services/api'

export function RichText({ content }: { content: string }) {
  return <div className="reader-rich-text">
    {content.split(/\n{2,}/).filter((block) => block.trim()).map((block, index) => {
      const trimmed = block.trim()
      if (/^[-*]\s/.test(trimmed)) {
        return <ul key={index}>{trimmed.split('\n').map((line, lineIndex) => <li key={lineIndex}>{inlineText(line.replace(/^[-*]\s/, ''))}</li>)}</ul>
      }
      if (/^#{1,3}\s/.test(trimmed)) {
        const level = Math.min(trimmed.match(/^#+/)?.[0].length ?? 2, 3)
        const text = trimmed.replace(/^#{1,3}\s/, '')
        return level === 1 ? <h2 key={index}>{inlineText(text)}</h2> : level === 2 ? <h3 key={index}>{inlineText(text)}</h3> : <h4 key={index}>{inlineText(text)}</h4>
      }
      return <p key={index}>{trimmed.split('\n').map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inlineText(line)}</span>)}</p>
    })}
  </div>
}

function inlineText(value: string) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

export function ImageContent({ fileId, alt }: { fileId: string; alt: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    getFileContent(fileId).then(({ blob }) => {
      objectUrl = URL.createObjectURL(blob)
      if (active) setUrl(objectUrl)
      else URL.revokeObjectURL(objectUrl)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Das Bild konnte nicht geladen werden.')
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])
  if (error) return <p className="inline-warning">{error}</p>
  if (!url) return <div className="viewer-loading" role="status">Bild wird geladen …</div>
  return <img className="slide-image" src={url} alt={alt} />
}

export function FileContentViewer({ file, blob, contentType, onDownload }: {
  file: StoredFile
  blob: Blob
  contentType: string
  onDownload: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const type = contentType.split(';')[0]?.toLowerCase() ?? file.content_type
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(() => {
    let active = true
    let url = ''
    Promise.resolve().then(() => {
      if (!active) return
      url = URL.createObjectURL(blob)
      setObjectUrl(url)
    })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [blob])

  if (!objectUrl && (type === 'application/pdf' || type.startsWith('image/'))) {
    return <div className="viewer-loading" role="status">Vorschau wird vorbereitet …</div>
  }

  if (type === 'application/pdf') {
    return <iframe className="file-pdf-frame" title={`PDF-Vorschau: ${file.filename}`} src={objectUrl} />
  }
  if (type.startsWith('image/')) {
    return <div className="file-image-stage">
      <div className="image-zoom-controls" aria-label="Bildvergrößerung">
        <button className="button button-quiet button-small" onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))} aria-label="Bild verkleinern">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="button button-quiet button-small" onClick={() => setZoom((current) => Math.min(3, current + 0.25))} aria-label="Bild vergrößern">+</button>
        <button className="button button-quiet button-small" onClick={() => setZoom(1)}>Zurücksetzen</button>
      </div>
      <div className="file-image-scroll"><img src={objectUrl} alt={file.filename} style={{ transform: `scale(${zoom})` }} /></div>
    </div>
  }
  if (type === 'text/plain') return <TextPreview blob={blob} />
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return <DocxPreview blob={blob} />
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return <SpreadsheetPreview blob={blob} />

  return <div className="unsupported-file-preview">
    <strong>Für diesen Dateityp ist keine Vorschau verfügbar.</strong>
    <p>Die Datei bleibt sicher in deinem Dateispeicher. Lade sie herunter, um sie mit einem passenden Programm zu öffnen.</p>
    <button className="button button-primary" onClick={onDownload}>Datei herunterladen</button>
  </div>
}

function TextPreview({ blob }: { blob: Blob }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    blob.text().then((text) => { if (active) setContent(text) }).catch(() => { if (active) setError('Der Textinhalt konnte nicht gelesen werden.') })
    return () => { active = false }
  }, [blob])
  if (error) return <div className="viewer-error" role="alert">{error}</div>
  if (content === null) return <div className="viewer-loading" role="status">Text wird geladen …</div>
  return <pre className="file-text-content">{content || 'Die Textdatei ist leer.'}</pre>
}

function DocxPreview({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ loading: boolean; error: string }>({ loading: true, error: '' })
  useEffect(() => {
    let active = true
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()
    import('docx-preview').then(({ renderAsync }) => renderAsync(
      blob,
      container,
      container,
      { renderAltChunks: false, ignoreWidth: true, ignoreHeight: true },
    )).then(() => { if (active) setState({ loading: false, error: '' }) })
      .catch(() => { if (active) setState({ loading: false, error: 'Das Word-Dokument ist beschädigt oder konnte nicht dargestellt werden.' }) })
    return () => { active = false; container.replaceChildren() }
  }, [blob])
  return <div className="docx-preview">
    {state.loading && <div className="viewer-loading" role="status">Word-Dokument wird geöffnet …</div>}
    {state.error && <div className="viewer-error" role="alert">{state.error}</div>}
    <div ref={containerRef} />
  </div>
}

type Sheet = { name: string; rows: string[][] }

function SpreadsheetPreview({ blob }: { blob: Blob }) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    import('exceljs').then(async (module) => {
      const exceljs = module.default
      const { Workbook } = exceljs
      const workbook = new Workbook()
      await workbook.xlsx.load(await blob.arrayBuffer())
      const result = workbook.worksheets.map((worksheet) => {
        const rows: string[][] = []
        worksheet.eachRow({ includeEmpty: true }, (row) => {
          if (rows.length >= 100) return
          const values: string[] = []
          row.eachCell({ includeEmpty: true }, (cell) => {
            if (values.length < 24) values.push(cell.text ?? '')
          })
          rows.push(values)
        })
        return { name: worksheet.name, rows }
      })
      if (active) { setSheets(result); setLoading(false) }
    }).catch(() => {
      if (active) { setError('Die Tabelle ist beschädigt oder konnte nicht geöffnet werden.'); setLoading(false) }
    })
    return () => { active = false }
  }, [blob])
  if (loading) return <div className="viewer-loading" role="status">Tabelle wird geladen …</div>
  if (error) return <div className="viewer-error" role="alert">{error}</div>
  const sheet = sheets[selected]
  return <div className="spreadsheet-preview">
    <div className="spreadsheet-tabs" role="tablist" aria-label="Arbeitsblätter">
      {sheets.map((item, index) => <button key={`${item.name}-${index}`} role="tab" aria-selected={selected === index} onClick={() => setSelected(index)}>{item.name}</button>)}
    </div>
    {sheet?.rows.length ? <div className="spreadsheet-table-wrap"><table><tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p>Dieses Arbeitsblatt ist leer.</p>}
    {(sheet?.rows.length ?? 0) >= 100 && <p className="spreadsheet-limit">Vorschau auf die ersten 100 Zeilen begrenzt.</p>}
  </div>
}

export function SlideContent({ slide }: { slide: PresentationSlide }) {
  return <div className="presentation-slide-content">
    {slide.title && <h2>{slide.title}</h2>}
    <RichText content={slide.content} />
    {slide.image_file_id && <ImageContent fileId={slide.image_file_id} alt={slide.title || 'Bild der Präsentationsfolie'} />}
  </div>
}
