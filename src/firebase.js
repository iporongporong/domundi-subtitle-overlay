import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// 스케줄 앱과 동일한 Firebase 프로젝트 (Realtime Database)를 공유합니다.
// 자막 데이터는 별도 최상위 경로("subtitleOverlay/")에 저장되어
// 스케줄 앱이 쓰는 기존 데이터와 겹치지 않습니다.
const firebaseConfig = {
  apiKey: "AIzaSyDXpNQxFzRZ09ZI3PH1Lk6RgmA-NBsLSMY",
  authDomain: "domundi-schedule-bbc58.firebaseapp.com",
  databaseURL: "https://domundi-schedule-bbc58-default-rtdb.firebaseio.com",
  projectId: "domundi-schedule-bbc58",
  storageBucket: "domundi-schedule-bbc58.firebasestorage.app",
  messagingSenderId: "434515486044",
  appId: "1:434515486044:web:1c302bac57d60d85e24d99",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
