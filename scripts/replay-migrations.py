#!/usr/bin/env python3
"""Replica en otra base de Supabase las migraciones que registró la base de desarrollo.

Lee el historial de `supabase_migrations.schema_migrations` del proyecto origen (lo que de verdad
se ejecutó ahí) y aplica en el destino, en orden y una transacción por migración, las versiones que
el destino todavía no tiene, registrándolas con la misma versión y el mismo nombre.

Uso:
    SUPABASE_ACCESS_TOKEN=... python3 scripts/replay-migrations.py --from <ref-origen> --to <ref-destino> [--until <versión>] [--dry-run]

Requiere un token de acceso de Supabase (Account > Access Tokens). No lo guardes en el repositorio.
Detente y revisa si una migración falla: esa migración se revierte y las siguientes no se aplican.
"""
import argparse, json, os, sys, urllib.request

API = 'https://api.supabase.com/v1/projects/{ref}/database/query'


def query(ref, sql, token):
    req = urllib.request.Request(API.format(ref=ref), data=json.dumps({'query': sql}).encode(), method='POST',
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        raise SystemExit(f'Error {err.code} en {ref}: {err.read().decode()[:2000]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', required=True)
    ap.add_argument('--to', dest='dst', required=True)
    ap.add_argument('--until', default=None, help='última versión a aplicar (inclusive)')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token:
        raise SystemExit('Falta SUPABASE_ACCESS_TOKEN.')
    if args.src == args.dst:
        raise SystemExit('El origen y el destino no pueden ser el mismo proyecto.')

    migrations = query(args.src, 'select version, name, statements from supabase_migrations.schema_migrations order by version', token)
    query(args.dst, """create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text unique, rollback text[]);""", token)
    done = {row['version'] for row in query(args.dst, 'select version from supabase_migrations.schema_migrations', token)}

    for m in migrations:
        version = m['version']
        if version in done or (args.until and version > args.until):
            continue
        if args.dry_run:
            print('pendiente', version, m['name'])
            continue
        tag = f'$mig_{version}$'
        body = '\n'.join(m['statements'])
        if tag in body:
            raise SystemExit(f'La migración {version} contiene la marca {tag}; no se puede citar de forma segura.')
        statements = 'array[' + ','.join(tag + s + tag for s in m['statements']) + ']::text[]'
        name = m['name'].replace("'", "''")
        query(args.dst, f"begin;\n{body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements, created_by) "
                        f"values ('{version}', '{name}', {statements}, 'replay-migrations');\ncommit;", token)
        print('ok', version, m['name'])


if __name__ == '__main__':
    sys.exit(main())
