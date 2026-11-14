// BarberOS no usa caché sin conexión: ventas, caja y comisiones siempre deben leerse de la base.
// Este archivo solo existe para retirar un service worker antiguo que pudiera quedar instalado
// en algún dispositivo: borra sus cachés y se da de baja. No intercepta ninguna petición.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
        await self.registration.unregister();
    })());
});
