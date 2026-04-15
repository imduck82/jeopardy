const firebaseConfig = {
  apiKey: "AIzaSyALfTlh8o1nMngKZ2lcEtDWmQToHe-sLYc",
  authDomain: "jeopardy-bc3e9.firebaseapp.com",
  databaseURL: "https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jeopardy-bc3e9",
  storageBucket: "jeopardy-bc3e9.firebasestorage.app",
  messagingSenderId: "10553570823",
  appId: "1:10553570823:web:49d8bf1ea0751658071ca2"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
