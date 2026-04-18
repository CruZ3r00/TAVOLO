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
        host: 'smtp.mailersend.net',
        port: 587,
        secure: false,
        auth:{
          user: 'MS_aoKERo@test-zkq340er7p3gd796.mlsender.net',
          pass: 'mssp.zym3IXI.vywj2lp28opg7oqz.kgdwenE', //mssp.zym3lXl.vywj2lp28opg7oqz.kgdwenE
        }
      },
      settings: {
        defaultFrom: 'no-reply@test-zkq340er7p3gd796.mlsender.net',
        defaultReplyTo: 'support@test-zkq340er7p3gd796.mlsender.net',
      },
    },
  },
});
