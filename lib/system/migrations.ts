import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Última migración incluida en ESTA versión del código (el archivo más reciente de supabase/migrations).
 * No consulta la base: el historial vive en un esquema que la API no expone. Si la carpeta no viaja
 * con el despliegue, devuelve null y la pantalla lo dice. Ver docs/implementation/PRODUCCION.md.
 */
export function latestBundledMigration(dir = path.join(process.cwd(), 'supabase', 'migrations')): string | null {
    try {
        const names = readdirSync(dir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
        const last = names[names.length - 1];
        return last ? last.replace(/\.sql$/, '') : null;
    } catch {
        return null;
    }
}
