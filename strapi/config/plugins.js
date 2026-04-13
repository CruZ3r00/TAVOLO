module.exports = () => ({
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth:{
          user: 'a7e207001@smtp-brevo.com',
          pass: 'bsk7tVsuZEvheYK',
        }
      },
      settings: {
        defaultFrom: 'a7e207001@smtp-brevo.com',
        defaultReplyTo: 'noreply@smtp-brevo.com',
      },
    },
  },
});
