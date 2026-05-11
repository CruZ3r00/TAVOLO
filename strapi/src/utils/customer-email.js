'use strict';

function clean(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeIT(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function emailError(message) {
  const err = new Error(message || 'Invio email non riuscito.');
  err._resCode = 'EMAIL_DELIVERY_FAILED';
  return err;
}

async function sendCustomerEmail(strapi, { to, subject, text, html }) {
  const email = clean(to).toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw emailError('Email cliente non valida.');
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await strapi.plugin('email').service('email').send({
        to: email,
        subject,
        text,
        html,
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  strapi.log.error(`customer email: invio fallito verso ${email}`, lastErr);
  throw emailError('Impossibile inviare l\'email al cliente. Controlla SMTP e riprova.');
}

async function sendReservationEmail(strapi, { reservation, restaurantName, type }) {
  const customer = escapeHtml(reservation.customer_name);
  const when = formatDateTimeIT(reservation.datetime);
  const restaurant = escapeHtml(restaurantName || 'il ristorante');
  const email = reservation.customer_email;

  const meta = {
    received: {
      subject: `Richiesta prenotazione ricevuta - ${restaurantName || 'Tavolo'}`,
      title: 'Richiesta prenotazione ricevuta',
      body: `Abbiamo ricevuto la tua richiesta di prenotazione per ${when}. Il ristorante ti risponderà appena possibile.`,
    },
    confirmed: {
      subject: `Prenotazione confermata - ${restaurantName || 'Tavolo'}`,
      title: 'Prenotazione confermata',
      body: `La tua prenotazione per ${when} è confermata.`,
    },
    rejected: {
      subject: `Prenotazione non disponibile - ${restaurantName || 'Tavolo'}`,
      title: 'Prenotazione non disponibile',
      body: `Ci dispiace, il ristorante non può confermare la tua prenotazione per ${when}.`,
    },
  }[type];

  if (!meta) return;

  await sendCustomerEmail(strapi, {
    to: email,
    subject: meta.subject,
    text: `Ciao ${reservation.customer_name},\n\n${meta.body}\n\n${restaurantName || 'Tavolo'}`,
    html: `<p>Ciao ${customer},</p><p>${escapeHtml(meta.body)}</p><p>A presto,<br>${restaurant}</p>`,
  });
}

async function sendTakeawayEmail(strapi, { order, restaurantName, type }) {
  const customer = escapeHtml(order.customer_name);
  const when = formatDateTimeIT(order.pickup_at);
  const restaurant = escapeHtml(restaurantName || 'il ristorante');
  const email = order.customer_email;

  const meta = {
    received: {
      subject: `Richiesta asporto ricevuta - ${restaurantName || 'Tavolo'}`,
      body: `Abbiamo ricevuto la tua richiesta d'asporto per ${when}. Il ristorante ti risponderà appena possibile.`,
    },
    confirmed: {
      subject: `Asporto confermato - ${restaurantName || 'Tavolo'}`,
      body: `Il tuo ordine d'asporto per ${when} è confermato.`,
    },
    rejected: {
      subject: `Asporto non disponibile - ${restaurantName || 'Tavolo'}`,
      body: `Ci dispiace, il ristorante non può confermare il tuo ordine d'asporto per ${when}.`,
    },
  }[type];

  if (!meta) return;

  await sendCustomerEmail(strapi, {
    to: email,
    subject: meta.subject,
    text: `Ciao ${order.customer_name},\n\n${meta.body}\n\n${restaurantName || 'Tavolo'}`,
    html: `<p>Ciao ${customer},</p><p>${escapeHtml(meta.body)}</p><p>A presto,<br>${restaurant}</p>`,
  });
}

module.exports = {
  clean,
  emailError,
  formatDateTimeIT,
  sendCustomerEmail,
  sendReservationEmail,
  sendTakeawayEmail,
};
