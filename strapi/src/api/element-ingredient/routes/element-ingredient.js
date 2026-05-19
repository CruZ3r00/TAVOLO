'use strict';

// Nessuna auto-rotta esposta: il content type viene gestito tramite gli
// endpoint di Element ricetta (`GET/PUT /api/elements/:id/recipe`) e tramite
// il servizio inventory. La definizione vuota serve solo a registrare il
// content type senza esporlo direttamente.
module.exports = { routes: [] };
