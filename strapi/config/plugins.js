module.exports = () => {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').trim();
  const providerOptions = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
  };

  if (smtpUser && smtpPass) {
    providerOptions.auth = {
      user: smtpUser,
      pass: smtpPass,
    };
  }

  return {
    'users-permissions': {
      config: {
        jwt: {
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        },
        register: {
          allowedFields: [
            'name',
            'surname',
            'birth_date',
            'coperti_invernali',
            'coperti_estivi',
            'restaurant_name',
            'vat',
            'province',
            'cap',
            'city',
            'address',
          ],
        },
      },
    },
    email: {
      config: {
        provider: 'nodemailer',
        providerOptions,
        settings: {
          defaultFrom: process.env.SMTP_DEFAULT_FROM || 'Tavolo <no-reply@app.comfortables.eu>',
          defaultReplyTo: process.env.SMTP_DEFAULT_REPLY_TO || process.env.SMTP_DEFAULT_FROM || 'support@app.comfortables.eu',
        },
      },
    },
  };
};
