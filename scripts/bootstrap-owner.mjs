import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

loadEnvConfig(process.cwd());
const expectedRef = 'zkvikttnpjwzfsygkdot';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const configuredRef = process.env.SONBLADE_BOOTSTRAP_PROJECT_REF;
if (!url || !key || !configuredRef) throw new Error('Configura la URL, clave de servidor y SONBLADE_BOOTSTRAP_PROJECT_REF localmente antes de continuar.');
if (configuredRef !== expectedRef || new URL(url).hostname !== `${expectedRef}.supabase.co`) {
    throw new Error('El destino no coincide con el proyecto de desarrollo autorizado; no se realizó ninguna operación.');
}

const rl = createInterface({ input: stdin, output: stdout });
const ask = (label) => rl.question(label);
function askHidden(label) {
    return new Promise((resolve, reject) => {
        if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return reject(new Error('Ejecuta el bootstrap en una terminal interactiva.'));
        stdout.write(label);
        let value = '';
        const onData = (chunk) => {
            for (const character of chunk.toString()) {
                if (character === '\u0003') { stdin.setRawMode(false); stdin.off('data', onData); reject(new Error('Cancelado.')); return; }
                if (character === '\r' || character === '\n') { stdout.write('\n'); stdin.setRawMode(false); stdin.off('data', onData); resolve(value); return; }
                if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
                else if (character >= ' ') value += character;
            }
        };
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
    });
}

let createdUserId;
try {
    const ownerName = (await ask('Nombre del propietario: ')).trim();
    const email = (await ask('Correo del propietario: ')).trim().toLowerCase();
    const businessName = (await ask('Nombre del negocio: ')).trim();
    const businessSlug = (await ask('Identificador corto del negocio: ')).trim().toLowerCase();
    const branchName = (await ask('Nombre de la primera sucursal: ')).trim();
    const password = await askHidden('Contraseña nueva (12 caracteres mínimo): ');
    const confirm = await askHidden('Confirma la contraseña: ');
    if (!ownerName || !email || !businessName || !businessSlug || !branchName || password.length < 12 || password !== confirm) {
        throw new Error('Los datos requeridos no son válidos o las contraseñas no coinciden.');
    }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: existing, error: checkError } = await admin.from('businesses').select('id').limit(1);
    if (checkError) throw new Error('No se pudo comprobar que el negocio inicial aún no existe.');
    if (existing?.length) throw new Error('El bootstrap ya fue completado; no se creó ninguna identidad.');

    const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: ownerName } });
    if (authError || !created.user) throw new Error('No se pudo crear la identidad del propietario.');
    createdUserId = created.user.id;

    const { data, error } = await admin.rpc('bootstrap_first_owner', {
        p_owner_user_id: createdUserId,
        p_owner_name: ownerName,
        p_business_name: businessName,
        p_business_slug: businessSlug,
        p_branch_name: branchName,
        p_timezone: 'America/Mexico_City',
    });
    if (error) {
        const { data: committed } = await admin.from('businesses').select('id').eq('owner_user_id', createdUserId).maybeSingle();
        if (committed) {
            stdout.write('El negocio se creó; verifica el estado en Supabase antes de reintentar.\n');
            process.exitCode = 2;
        } else if (error.code) {
            await admin.auth.admin.deleteUser(createdUserId);
            throw new Error('Falló la creación del negocio; se eliminó únicamente la identidad recién creada por esta ejecución.');
        } else {
            throw new Error('El resultado de la operación es incierto; se conservó la identidad para evitar borrar un propietario creado. Revisa el proyecto antes de continuar.');
        }
    } else {
        stdout.write(`Bootstrap completado. Business ID: ${data.business_id}; branch ID: ${data.branch_id}.\n`);
        stdout.write('Ahora confirma el correo, inicia sesión y configura el servicio de corte desde /onboarding.\n');
    }
} finally {
    rl.close();
}

