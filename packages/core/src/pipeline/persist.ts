import { readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"

/**
 * Persistência de arquivos de estado do pipeline (backlog, observability,
 * token-economy, pipeline-state, loop-state).
 *
 * Escrita atômica via `${filePath}.${randomUUID()}.tmp` + rename SEM fsync.
 * Risco aceito: em crash, a última gravação pode ser perdida (a entrada de
 * diretório do rename pode não ser durável sem fsync no arquivo e no diretório).
 * Mitigação: o rename é atômico — um crash nunca deixa arquivo truncado/corrompido,
 * apenas potencialmente defasado. Um `.tmp` órfão de um crash é coletado pelo
 * cleanupOrphanedTmp na próxima carga. fsync deliberadamente não adicionado:
 * mudança de comportamento grande para um ganho marginal em ambiente desktop.
 */

/**
 * Remove arquivos `*.tmp` órfãos (de escritas atômicas interrompidas) mais
 * velhos que 1h no diretório. Com `prefix` (basename do arquivo de estado),
 * só arquivos `${prefix}*` terminando em `.tmp` são considerados — nunca
 * toca .tmp de outros engines no mesmo diretório. Retorna a quantidade removida.
 */
export function cleanupOrphanedTmp(dir: string, prefix?: string): number {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return 0 // diretório ausente/inacessível: nada para limpar
  }
  const cutoff = Date.now() - 60 * 60 * 1000
  let removed = 0
  for (const name of entries) {
    if (!name.endsWith(".tmp")) continue
    if (prefix && !name.startsWith(prefix)) continue
    try {
      if (statSync(join(dir, name)).mtimeMs < cutoff) {
        unlinkSync(join(dir, name))
        removed++
      }
    } catch {
      // sumiu entre readdir e unlink (outro writer): segue em frente
    }
  }
  return removed
}
