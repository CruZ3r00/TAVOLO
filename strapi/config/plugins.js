module.exports = () => ({
  'users-permissions': {
    config: {
      register: {
        allowedFields: [
          'name',
          'surname',
          'birth_date',
          'coperti_invernali',
          'coperti_estivi',
          'restaurant_name',
        ],
      },
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth:{
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      },
      settings: {
        defaultFrom: process.env.SMTP_DEFAULT_FROM,
        defaultReplyTo: process.env.SMTP_DEFAULT_REPLY_TO,
      },
    },
  },
});
