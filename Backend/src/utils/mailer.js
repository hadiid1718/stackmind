import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

let transporter;

const getTransporter = () => {
  if (!transporter) {
    const auth = env.smtpUser
      ? {
          user: env.smtpUser,
          pass: env.smtpPass,
        }
      : undefined;

    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth,
    });
  }

  return transporter;
};

export const sendMail = async ({ to, subject, html, text }) => {
  if (!env.smtpHost) {
    return;
  }

  await getTransporter().sendMail({
    from: env.mailFrom,
    to,
    subject,
    html,
    text,
  });
};
