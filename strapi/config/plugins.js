module.exports = () => ({
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
        defaultFrom: 'MS_aoKERo@test-zkq340er7p3gd796.mlsender.net',
        defaultReplyTo: 'MS_aoKERo@test-zkq340er7p3gd796.mlsender.net',
      },
    },
  },
});
