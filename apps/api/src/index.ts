import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';

admin.initializeApp();

const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', project: 'dindin' });
});

export const api = functions.https.onRequest(app);
