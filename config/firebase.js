const admin = require('firebase-admin');
const path  = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let db, auth, rtdb, storage, messaging;

function initializeFirebase() {
  if (admin.apps.length > 0) return; 

  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = require(path.resolve(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
  } else {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_SERVICE_ACCOUNT_PATH');
  }

  const appConfig = {
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  };
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    appConfig.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  }

  admin.initializeApp(appConfig);

  db        = admin.firestore();
  auth      = admin.auth();
  rtdb      = admin.database();
  storage   = process.env.FIREBASE_STORAGE_BUCKET ? admin.storage().bucket() : null;
  messaging = admin.messaging();

  console.log('✅ Firebase TROL: Admin inicializado correctamente');
}

module.exports = {
  initializeFirebase,
  getFirestore:  () => db,
  getAuth:       () => auth,
  getRTDB:       () => rtdb,
  getStorage:    () => storage,
  getMessaging:  () => messaging,
};
