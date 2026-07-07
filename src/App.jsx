import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { db } from './firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import './index.css';

// ─────────────────────────────────────────────
// GLOBAL AI CLIENT — instantiated once, outside component
// Type-guarded fallback prevents blank-screen crash when env key is missing
// ─────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English',  nativeName: 'English' },
  { code: 'hi', label: 'Hindi',    nativeName: 'हिन्दी' },
  { code: 'bn', label: 'Bengali',  nativeName: 'বাংলা' },
  { code: 'ta', label: 'Tamil',    nativeName: 'தமிழ்' },
  { code: 'te', label: 'Telugu',   nativeName: 'తెలుగు' },
  { code: 'mr', label: 'Marathi',  nativeName: 'मराठी' },
];

const ISSUE_CATEGORIES = [
  'Pothole',
  'Streetlight Broken',
  'Water Leakage',
  'Garbage Accumulation',
  'Sewage Overflow',
  'Other',
];

const CATEGORY_ICONS = {
  Pothole: '🕳️',
  'Streetlight Broken': '💡',
  'Water Leakage': '💧',
  'Garbage Accumulation': '🗑️',
  'Sewage Overflow': '🚧',
  Other: '📌',
};

// ── Full multilingual UI strings ──
const UI_STRINGS = {
  en: {
    brandTitle: 'Civic Hub',
    brandSub: 'Smart Bharat Platform',
    navCompanion: 'AI Civic Companion',
    navReport: 'Report Issues',
    poweredBy: 'Powered by Gemini AI',
    chatTitle: 'Smart Bharat AI',
    respondIn: 'Respond in:',
    chatPlaceholder: 'Ask about government schemes, services, rights…',
    sendBtn: 'Send',
    jargonToggle: 'Jargon Smashing Mode',
    jargonDesc: 'ON: AI will always break down complex official jargon into plain bullet-point language.',
    reportTitle: 'Report a Civic Issue',
    reportSub: 'Help build a better city — submit a complaint and track its resolution.',
    newComplaint: 'New Complaint',
    issueCategory: 'Issue Category',
    locationDesc: 'Location Description',
    locationPlaceholder: 'e.g. Near Gandhi Chowk, main road opposite City Mall, Pune…',
    gpsCoords: 'GPS Coordinates',
    useLocation: '📍 Use Current Location',
    detecting: '⏳ Detecting location…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ Location access denied — retry',
    coordsNote: 'Coordinates captured and will be saved with your report.',
    submitTicket: '🚀 Submit Ticket',
    submitting: 'Submitting…',
    activeComplaints: 'Active Public Complaints',
    fetchingComplaints: 'Fetching complaints…',
    noComplaints: 'No complaints filed yet.',
    beFirst: 'Be the first to report a civic issue!',
    successMsg: 'Ticket submitted successfully! Your complaint has been logged.',
    onlineStatus: '● Online',
    typingStatus: '● Typing…',
    // Error and alert strings — all localized
    invalidCategory: '❌ Invalid issue category selected.',
    invalidCoords: '❌ Captured GPS coordinates are invalid. Please retry location.',
    submitFailed: '❌ Failed to submit the ticket. Please check your connection and try again.',
    firestoreFetchError: '⚠️ Failed to load complaints. Check your connection and refresh.',
    locationGuide: 'To enable location: open your browser settings → Site Settings → Location → Allow.',
    chatError: '⚠️ Connection error: Unable to reach the AI service. Please check your internet connection or API key, then try again.',
    sessionError: '⚠️ AI session is not ready. Please wait a moment and try again.',
  },
  hi: {
    brandTitle: 'सिविक हब',
    brandSub: 'स्मार्ट भारत प्लेटफ़ॉर्म',
    navCompanion: 'AI नागरिक सहायक',
    navReport: 'समस्या रिपोर्ट करें',
    poweredBy: 'Gemini AI द्वारा संचालित',
    chatTitle: 'स्मार्ट भारत AI',
    respondIn: 'उत्तर दें:',
    chatPlaceholder: 'सरकारी योजनाओं, सेवाओं, अधिकारों के बारे में पूछें…',
    sendBtn: 'भेजें',
    jargonToggle: 'शब्दजाल तोड़ने का मोड',
    jargonDesc: 'चालू: AI हमेशा जटिल सरकारी भाषा को सरल बुलेट बिंदुओं में समझाएगा।',
    reportTitle: 'नागरिक समस्या रिपोर्ट करें',
    reportSub: 'एक बेहतर शहर बनाने में मदद करें — शिकायत दर्ज करें और समाधान ट्रैक करें।',
    newComplaint: 'नई शिकायत',
    issueCategory: 'समस्या श्रेणी',
    locationDesc: 'स्थान विवरण',
    locationPlaceholder: 'जैसे: गांधी चौक के पास, सिटी मॉल के सामने, पुणे…',
    gpsCoords: 'GPS निर्देशांक',
    useLocation: '📍 वर्तमान स्थान उपयोग करें',
    detecting: '⏳ स्थान खोजा जा रहा है…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ स्थान अनुमति अस्वीकृत — पुनः प्रयास करें',
    coordsNote: 'निर्देशांक प्राप्त हो गए और रिपोर्ट के साथ सहेजे जाएंगे।',
    submitTicket: '🚀 टिकट जमा करें',
    submitting: 'जमा हो रहा है…',
    activeComplaints: 'सक्रिय सार्वजनिक शिकायतें',
    fetchingComplaints: 'शिकायतें लाई जा रही हैं…',
    noComplaints: 'अभी कोई शिकायत दर्ज नहीं है।',
    beFirst: 'पहले नागरिक समस्या की रिपोर्ट करें!',
    successMsg: 'टिकट सफलतापूर्वक जमा हो गया! आपकी शिकायत दर्ज की जा चुकी है।',
    onlineStatus: '● ऑनलाइन',
    typingStatus: '● टाइप हो रहा है…',
    invalidCategory: '❌ अमान्य समस्या श्रेणी चुनी गई।',
    invalidCoords: '❌ GPS निर्देशांक अमान्य हैं। कृपया पुनः प्रयास करें।',
    submitFailed: '❌ टिकट सबमिट करने में विफल। कनेक्शन जांचें और पुनः प्रयास करें।',
    firestoreFetchError: '⚠️ शिकायतें लोड नहीं हुईं। कनेक्शन जांचें और ताज़ा करें।',
    locationGuide: 'स्थान सक्षम करने के लिए: ब्राउज़र सेटिंग → साइट सेटिंग → स्थान → अनुमति दें।',
    chatError: '⚠️ कनेक्शन त्रुटि: AI सेवा से संपर्क नहीं हो सका। कृपया इंटरनेट कनेक्शन जांचें।',
    sessionError: '⚠️ AI सत्र तैयार नहीं है। कृपया एक क्षण प्रतीक्षा करें।',
  },
  bn: {
    brandTitle: 'সিভিক হাব',
    brandSub: 'স্মার্ট ভারত প্ল্যাটফর্ম',
    navCompanion: 'AI নাগরিক সহায়ক',
    navReport: 'সমস্যা রিপোর্ট করুন',
    poweredBy: 'Gemini AI দ্বারা পরিচালিত',
    chatTitle: 'স্মার্ট ভারত AI',
    respondIn: 'উত্তর দিন:',
    chatPlaceholder: 'সরকারি প্রকল্প, পরিষেবা, অধিকার সম্পর্কে জিজ্ঞেস করুন…',
    sendBtn: 'পাঠান',
    jargonToggle: 'জার্গন ভাঙার মোড',
    jargonDesc: 'চালু: AI সর্বদা জটিল সরকারি ভাষা সহজ বুলেট পয়েন্টে ব্যাখ্যা করবে।',
    reportTitle: 'নাগরিক সমস্যা রিপোর্ট করুন',
    reportSub: 'একটি উন্নত শহর গড়ুন — অভিযোগ দাখিল করুন এবং সমাধান ট্র্যাক করুন।',
    newComplaint: 'নতুন অভিযোগ',
    issueCategory: 'সমস্যার বিভাগ',
    locationDesc: 'অবস্থানের বিবরণ',
    locationPlaceholder: 'যেমন: গান্ধী চক-এর কাছে, সিটি মলের সামনে…',
    gpsCoords: 'GPS স্থানাঙ্ক',
    useLocation: '📍 বর্তমান অবস্থান ব্যবহার করুন',
    detecting: '⏳ অবস্থান শনাক্ত হচ্ছে…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ অবস্থান অ্যাক্সেস প্রত্যাখ্যাত — পুনরায় চেষ্টা করুন',
    coordsNote: 'স্থানাঙ্ক সংগ্রহ করা হয়েছে এবং রিপোর্টের সাথে সংরক্ষিত হবে।',
    submitTicket: '🚀 টিকিট জমা দিন',
    submitting: 'জমা দেওয়া হচ্ছে…',
    activeComplaints: 'সক্রিয় সরকারি অভিযোগ',
    fetchingComplaints: 'অভিযোগ আনা হচ্ছে…',
    noComplaints: 'এখনও কোনো অভিযোগ দাখিল হয়নি।',
    beFirst: 'প্রথম নাগরিক সমস্যা রিপোর্ট করুন!',
    successMsg: 'টিকিট সফলভাবে জমা হয়েছে! আপনার অভিযোগ নথিভুক্ত হয়েছে।',
    onlineStatus: '● অনলাইন',
    typingStatus: '● টাইপ হচ্ছে…',
    invalidCategory: '❌ অবৈধ সমস্যার বিভাগ নির্বাচিত হয়েছে।',
    invalidCoords: '❌ GPS স্থানাঙ্ক অবৈধ। আবার চেষ্টা করুন।',
    submitFailed: '❌ টিকিট জমা দিতে ব্যর্থ হয়েছে। সংযোগ পরীক্ষা করুন।',
    firestoreFetchError: '⚠️ অভিযোগ লোড হয়নি। সংযোগ পরীক্ষা করুন এবং রিফ্রেশ করুন।',
    locationGuide: 'অবস্থান সক্ষম করতে: ব্রাউজার সেটিংস → সাইট সেটিংস → অবস্থান → অনুমতি দিন।',
    chatError: '⚠️ সংযোগ ত্রুটি: AI পরিষেবায় পৌঁছানো যাচ্ছে না। ইন্টারনেট সংযোগ পরীক্ষা করুন।',
    sessionError: '⚠️ AI সেশন প্রস্তুত নয়। একটু অপেক্ষা করুন।',
  },
  ta: {
    brandTitle: 'சிவிக் ஹப்',
    brandSub: 'ஸ்மார்ட் பாரத் தளம்',
    navCompanion: 'AI குடிமை உதவியாளர்',
    navReport: 'சிக்கல்களை புகாரளிக்கவும்',
    poweredBy: 'Gemini AI ஆல் இயக்கப்படுகிறது',
    chatTitle: 'ஸ்மார்ட் பாரத் AI',
    respondIn: 'பதிலளிக்கவும்:',
    chatPlaceholder: 'அரசுத் திட்டங்கள், சேவைகள், உரிமைகள் பற்றி கேளுங்கள்…',
    sendBtn: 'அனுப்பு',
    jargonToggle: 'வகைமொழி உடைக்கும் முறை',
    jargonDesc: 'இயக்கம்: AI எப்போதும் சிக்கலான அரசு மொழியை எளிய புள்ளிகளில் விளக்கும்.',
    reportTitle: 'குடிமை பிரச்சினையை புகாரளிக்கவும்',
    reportSub: 'சிறந்த நகரம் கட்டுங்கள் — புகார் தாக்கல் செய்து தீர்வை கண்காணிக்கவும்.',
    newComplaint: 'புதிய புகார்',
    issueCategory: 'சிக்கல் வகை',
    locationDesc: 'இட விவரம்',
    locationPlaceholder: 'எ.கா. காந்தி சௌக் அருகில், சிட்டி மாலுக்கு எதிரில்…',
    gpsCoords: 'GPS ஆள்கூறுகள்',
    useLocation: '📍 தற்போதைய இடத்தைப் பயன்படுத்தவும்',
    detecting: '⏳ இடம் கண்டறியப்படுகிறது…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ இட அணுகல் மறுக்கப்பட்டது — மீண்டும் முயற்சிக்கவும்',
    coordsNote: 'ஆள்கூறுகள் பெறப்பட்டு உங்கள் அறிக்கையுடன் சேமிக்கப்படும்.',
    submitTicket: '🚀 டிக்கெட் சமர்ப்பி',
    submitting: 'சமர்ப்பிக்கிறது…',
    activeComplaints: 'செயலில் உள்ள பொது புகார்கள்',
    fetchingComplaints: 'புகார்கள் பெறப்படுகின்றன…',
    noComplaints: 'இதுவரை எந்த புகாரும் தாக்கல் செய்யப்படவில்லை.',
    beFirst: 'முதல் குடிமை பிரச்சினையை புகாரளிக்கவும்!',
    successMsg: 'டிக்கெட் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது! உங்கள் புகார் பதிவு செய்யப்பட்டது.',
    onlineStatus: '● ஆன்லைன்',
    typingStatus: '● தட்டச்சு செய்கிறது…',
    invalidCategory: '❌ தவறான சிக்கல் வகை தேர்ந்தெடுக்கப்பட்டது.',
    invalidCoords: '❌ GPS ஆள்கூறுகள் தவறானவை. மீண்டும் முயற்சிக்கவும்.',
    submitFailed: '❌ டிக்கெட் சமர்ப்பிக்கத் தவறிவிட்டது. இணைப்பை சரிபார்க்கவும்.',
    firestoreFetchError: '⚠️ புகார்கள் ஏற்றப்படவில்லை. இணைப்பை சரிபார்த்து புதுப்பிக்கவும்.',
    locationGuide: 'இடத்தை இயக்க: உலாவி அமைப்புகள் → தள அமைப்புகள் → இடம் → அனுமதி.',
    chatError: '⚠️ இணைப்பு பிழை: AI சேவையை அடைய முடியவில்லை. இணைய இணைப்பை சரிபார்க்கவும்.',
    sessionError: '⚠️ AI அமர்வு தயாராக இல்லை. சற்று நேரம் காத்திருக்கவும்.',
  },
  te: {
    brandTitle: 'సివిక్ హబ్',
    brandSub: 'స్మార్ట్ భారత్ ప్లాట్‌ఫారమ్',
    navCompanion: 'AI పౌర సహాయకుడు',
    navReport: 'సమస్యలు నివేదించండి',
    poweredBy: 'Gemini AI చే నడపబడుతోంది',
    chatTitle: 'స్మార్ట్ భారత్ AI',
    respondIn: 'సమాధానం ఇవ్వండి:',
    chatPlaceholder: 'ప్రభుత్వ పథకాలు, సేవలు, హక్కుల గురించి అడగండి…',
    sendBtn: 'పంపు',
    jargonToggle: 'జార్గన్ పగులగొట్టే మోడ్',
    jargonDesc: 'ఆన్: AI ఎల్లప్పుడూ సంక్లిష్ట ప్రభుత్వ భాషను సాధారణ బులెట్ పాయింట్లలో వివరిస్తుంది.',
    reportTitle: 'పౌర సమస్య నివేదించండి',
    reportSub: 'మెరుగైన నగరాన్ని నిర్మించండి — ఫిర్యాదు నమోదు చేసి పరిష్కారాన్ని ట్రాక్ చేయండి.',
    newComplaint: 'కొత్త ఫిర్యాదు',
    issueCategory: 'సమస్య వర్గం',
    locationDesc: 'స్థాన వివరణ',
    locationPlaceholder: 'ఉదా. గాంధీ చౌక్ దగ్గర, సిటీ మాల్ ఎదురుగా…',
    gpsCoords: 'GPS నిర్దేశాంకాలు',
    useLocation: '📍 ప్రస్తుత స్థానాన్ని ఉపయోగించండి',
    detecting: '⏳ స్థానం గుర్తించబడుతోంది…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ స్థాన అనుమతి నిరాకరించబడింది — తిరిగి ప్రయత్నించండి',
    coordsNote: 'నిర్దేశాంకాలు సేకరించబడ్డాయి మరియు నివేదికతో సేవ్ చేయబడతాయి.',
    submitTicket: '🚀 టిక్కెట్ సమర్పించండి',
    submitting: 'సమర్పిస్తోంది…',
    activeComplaints: 'క్రియాశీల పౌర ఫిర్యాదులు',
    fetchingComplaints: 'ఫిర్యాదులు తెప్పించబడుతున్నాయి…',
    noComplaints: 'ఇంకా ఏ ఫిర్యాదూ దాఖలు కాలేదు.',
    beFirst: 'మొదట పౌర సమస్యను నివేదించండి!',
    successMsg: 'టిక్కెట్ విజయవంతంగా సమర్పించబడింది! మీ ఫిర్యాదు నమోదైంది.',
    onlineStatus: '● ఆన్‌లైన్',
    typingStatus: '● టైప్ అవుతోంది…',
    invalidCategory: '❌ చెల్లని సమస్య వర్గం ఎంచుకోబడింది.',
    invalidCoords: '❌ GPS నిర్దేశాంకాలు చెల్లవు. మళ్ళీ ప్రయత్నించండి.',
    submitFailed: '❌ టిక్కెట్ సమర్పించడం విఫలమైంది. కనెక్షన్ తనిఖీ చేయండి.',
    firestoreFetchError: '⚠️ ఫిర్యాదులు లోడ్ కాలేదు. కనెక్షన్ తనిఖీ చేసి రిఫ్రెష్ చేయండి.',
    locationGuide: 'స్థానాన్ని ఎనేబుల్ చేయడానికి: బ్రౌజర్ సెట్టింగ్స్ → సైట్ సెట్టింగ్స్ → లొకేషన్ → అనుమతించు.',
    chatError: '⚠️ కనెక్షన్ లోపం: AI సేవను చేరుకోలేకపోయింది. ఇంటర్నెట్ కనెక్షన్ తనిఖీ చేయండి.',
    sessionError: '⚠️ AI సెషన్ సిద్ధంగా లేదు. కొద్దిసేపు వేచి ఉండండి.',
  },
  mr: {
    brandTitle: 'सिव्हिक हब',
    brandSub: 'स्मार्ट भारत व्यासपीठ',
    navCompanion: 'AI नागरिक सहाय्यक',
    navReport: 'समस्या नोंदवा',
    poweredBy: 'Gemini AI द्वारे चालवले जाते',
    chatTitle: 'स्मार्ट भारत AI',
    respondIn: 'उत्तर द्या:',
    chatPlaceholder: 'सरकारी योजना, सेवा, हक्कांबद्दल विचारा…',
    sendBtn: 'पाठवा',
    jargonToggle: 'शब्दजाल मोडणारा मोड',
    jargonDesc: 'चालू: AI नेहमी गुंतागुंतीची सरकारी भाषा सोप्या मुद्द्यांमध्ये समजावून सांगेल.',
    reportTitle: 'नागरिक समस्या नोंदवा',
    reportSub: 'चांगले शहर बनवण्यास मदत करा — तक्रार दाखल करा आणि निराकरण ट्रॅक करा.',
    newComplaint: 'नवीन तक्रार',
    issueCategory: 'समस्या श्रेणी',
    locationDesc: 'स्थान वर्णन',
    locationPlaceholder: 'उदा. गांधी चौकाजवळ, सिटी मॉलसमोर, पुणे…',
    gpsCoords: 'GPS निर्देशांक',
    useLocation: '📍 सध्याचे स्थान वापरा',
    detecting: '⏳ स्थान शोधले जात आहे…',
    coordsCaptured: (lat, lng) => `✅ ${lat}, ${lng}`,
    locationDenied: '❌ स्थान परवानगी नाकारली — पुन्हा प्रयत्न करा',
    coordsNote: 'निर्देशांक मिळवले आणि अहवालासह जतन केले जातील.',
    submitTicket: '🚀 तिकीट सादर करा',
    submitting: 'सादर केले जात आहे…',
    activeComplaints: 'सक्रिय सार्वजनिक तक्रारी',
    fetchingComplaints: 'तक्रारी आणल्या जात आहेत…',
    noComplaints: 'अद्याप कोणतीही तक्रार दाखल केलेली नाही.',
    beFirst: 'पहिली नागरिक समस्या नोंदवा!',
    successMsg: 'तिकीट यशस्वीरित्या सादर केले! तुमची तक्रार नोंदली गेली आहे.',
    onlineStatus: '● ऑनलाइन',
    typingStatus: '● टाइप होत आहे…',
    invalidCategory: '❌ अवैध समस्या श्रेणी निवडली गेली.',
    invalidCoords: '❌ GPS निर्देशांक अवैध आहेत. पुन्हा प्रयत्न करा.',
    submitFailed: '❌ तिकीट सादर करण्यात अयशस्वी. कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.',
    firestoreFetchError: '⚠️ तक्रारी लोड झाल्या नाहीत. कनेक्शन तपासा आणि रिफ्रेश करा.',
    locationGuide: 'स्थान सक्षम करण्यासाठी: ब्राउझर सेटिंग → साइट सेटिंग → स्थान → परवानगी द्या.',
    chatError: '⚠️ कनेक्शन त्रुटी: AI सेवेशी संपर्क साधता आला नाही. इंटरनेट कनेक्शन तपासा.',
    sessionError: '⚠️ AI सत्र तयार नाही. कृपया थोडा वेळ प्रतीक्षा करा.',
  },
};

// Strict civic-only system prompt — guardrails prevent out-of-scope replies.
// Includes phonetic transliteration mapping instructions for Hinglish / Benglish etc.
const buildSystemPrompt = (langLabel, langCode, jargonMode) => {
  const scriptMap = {
    hi: 'Devanagari (हिन्दी)',
    mr: 'Devanagari (मराठी)',
    bn: 'Bengali script (বাংলা)',
    ta: 'Tamil script (தமிழ்)',
    te: 'Telugu script (తెలుగు)',
    en: 'Latin/English',
  };
  const targetScript = scriptMap[langCode] || langLabel;

  const baseGuardrail = `You are a single-purpose Indian civic assistant named Smart Bharat AI. If the user asks about topics unrelated to public schemes, legal jargon, or civic services (such as programming, recipes, general science, or entertainment), you must politely refuse and guide them back to civic services in their active language. Do not answer off-topic questions under any circumstances.`;

  const coreDirectives = `
Your core directives:
1. Answer clearly and concisely when asked about government services, schemes, or citizen rights.
2. List mandatory documents required for any public service or scheme.
3. ${jargonMode ? 'ALWAYS break down complex official documents or legal jargon into plain, 5th-grade level bullet points — this mode is ALWAYS active.' : 'When the user pastes complex official documents or legal jargon, translate and simplify it into plain bullet points.'}
4. CRITICAL LANGUAGE DIRECTIVE: The user's active language is ${langLabel}. You MUST respond completely and natively in ${langLabel}, using the correct regional script: ${targetScript}. Every single word of your response must be in ${langLabel} only. Do NOT use English or any other language unless ${langLabel} is English.
5. TRANSLITERATION MAPPING: If the user writes in phonetic romanized text (e.g. Hinglish like "ration card kaise banaye", Benglish like "ami ki korbo", or any other phonetic transliteration of ${langLabel}), you MUST recognize this as a message in ${langLabel} and respond fully in the proper ${targetScript} script — never mirror back romanized text.`;

  return baseGuardrail + coreDirectives;
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatTimestamp = (ts) => {
  try {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return 'Just now';
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Just now';
  }
};

// Sanitize text: strip HTML tags, trim, enforce character cap
const sanitizeText = (text, maxLen = 800) => {
  return text
    .replace(/<[^>]*>/g, '')   // strip HTML
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim()
    .slice(0, maxLen);
};

// Validate GPS coordinate ranges
const isValidCoords = (coords) => {
  if (!coords || typeof coords !== 'object') return false;
  const { lat, lng } = coords;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

function App() {
  // ── Tab
  const [activeTab, setActiveTab] = useState('companion');

  // ── Language selection — now tracks a code, not raw label
  const [selectedLangCode, setSelectedLangCode] = useState('en');
  const t = UI_STRINGS[selectedLangCode] || UI_STRINGS.en;
  const selectedLang = SUPPORTED_LANGUAGES.find(l => l.code === selectedLangCode);

  // ── Jargon Smashing Mode
  const [jargonMode, setJargonMode] = useState(false);

  // ── AI Companion state
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Namaste! 🙏 I am **Smart Bharat AI**, your civic companion. Ask me about government schemes, services, documents, or paste any official jargon — I'll simplify it for you. Choose your preferred language above!",
    },
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Network / API error shown in a separate banner, never pushed to AI history
  const [chatNetworkError, setChatNetworkError] = useState(null);
  // Firestore fetch error shown as an inline banner in the tickets list
  const [ticketsFetchError, setTicketsFetchError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // ── Persistent single chat session ref.
  // We never destroy this between language/jargon toggles — instead we
  // re-seed it via history to preserve multi-turn context.
  const chatSessionRef = useRef(null);

  // ── Report Issues state
  const [reportCategory, setReportCategory] = useState('Pothole');
  const [reportLocation, setReportLocation] = useState('');
  const [reportCoords, setReportCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // 'idle' | 'loading' | 'captured' | 'error' | 'denied'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  // ─────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // Rebuild the persistent chat session when language or jargon mode changes.
  // History is re-seeded so multi-turn context is fully preserved.
  // A new session is created (not destroyed) only when system instructions need to change.
  useEffect(() => {
    // Build SDK-compatible history from React state.
    // Only include valid user/ai messages — exclude any system or error entries.
    const history = messages
      .filter(
        (msg) =>
          (msg.role === 'user' || msg.role === 'ai') &&
          typeof msg.text === 'string' &&
          msg.text.trim().length > 0
      )
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));

    chatSessionRef.current = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: buildSystemPrompt(selectedLang.label, selectedLangCode, jargonMode),
      },
      history,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLangCode, jargonMode]);
  // NOTE: `messages` is intentionally NOT a dependency here. We only want to
  // rebuild the session when language or jargon settings change — not on every
  // message. The history snapshot at the time of toggle is sufficient for context.

  // ─────────────────────────────────────────────
  // AI COMPANION LOGIC
  // ─────────────────────────────────────────────

  const handleSendMessage = async () => {
    const trimmed = userInput.trim();
    if (!trimmed || isLoading) return;

    // Null-pointer guard: ensure session is ready before proceeding
    if (!chatSessionRef.current) {
      setChatNetworkError(t.sessionError);
      return;
    }

    const sanitized = sanitizeText(trimmed, 600);
    const userMessage = { role: 'user', text: sanitized };
    setMessages((prev) => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);
    setChatNetworkError(null); // clear previous error banner

    try {
      const response = await chatSessionRef.current.sendMessage({
        message: sanitized,
      });

      const aiText =
        response.text ||
        'I apologize, I was unable to generate a response. Please try again.';

      setMessages((prev) => [...prev, { role: 'ai', text: aiText }]);
    } catch {
      // Network / API errors flagged visually — NEVER pushed into AI history array
      setChatNetworkError(t.chatError);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // renderText: memoized on messages array — does NOT re-run on userInput keystrokes
  const renderedMessages = useMemo(() => {
    const renderText = (text) => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      });
    };
    return messages.map((msg) => ({ ...msg, rendered: renderText(msg.text) }));
  }, [messages]);

  // ─────────────────────────────────────────────
  // REPORT ISSUES LOGIC
  // ─────────────────────────────────────────────

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoStatus('captured');
      },
      (err) => {
        // PERMISSION_DENIED = code 1
        if (err.code === 1) {
          setGeoStatus('denied');
        } else {
          setGeoStatus('error');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();

    // ── Client-side validation & sanitization ──
    const sanitizedLocation = sanitizeText(reportLocation, 400);
    if (!sanitizedLocation) return;

    // Validate category against the authorized list
    if (!ISSUE_CATEGORIES.includes(reportCategory)) {
      alert(t.invalidCategory);
      return;
    }

    // Validate GPS coordinates if captured
    if (reportCoords && !isValidCoords(reportCoords)) {
      alert(t.invalidCoords);
      setGeoStatus('idle');
      setReportCoords(null);
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      await addDoc(collection(db, 'tickets'), {
        category: reportCategory,
        locationDescription: sanitizedLocation,
        coordinates: reportCoords ? {
          lat: reportCoords.lat,
          lng: reportCoords.lng,
        } : null,
        status: 'Open',
        createdAt: serverTimestamp(),
      });

      // Clear the form
      setReportCategory('Pothole');
      setReportLocation('');
      setReportCoords(null);
      setGeoStatus('idle');
      setSubmitSuccess(true);

      // Refresh the ticket list
      await fetchTickets();

      // Hide success banner after 4 seconds
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch {
      alert(t.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keep a ref to the current translation token so fetchTickets never
  // needs to re-bind when the language changes — eliminates stale closures.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsFetchError(null);
    try {
      const q = query(
        collection(db, 'tickets'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTickets(data);
    } catch {
      // Surface error as a localized inline banner instead of silently swallowing it
      setTicketsFetchError(tRef.current.firestoreFetchError);
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []); // stable — reads live translation via tRef


  // ─────────────────────────────────────────────
  // GEO BUTTON LABEL
  // ─────────────────────────────────────────────
  const geoButtonLabel = () => {
    if (geoStatus === 'loading') return <><span className="glowing-spinner" /> {t.detecting}</>;
    if (geoStatus === 'captured')
      return t.coordsCaptured(reportCoords.lat.toFixed(5), reportCoords.lng.toFixed(5));
    if (geoStatus === 'error') return t.locationDenied;
    if (geoStatus === 'denied') return '❌ ' + t.locationDenied;
    return t.useLocation;
  };

  // Fetch tickets when Report tab is active
  // fetchTickets is stable (empty dep array) so this effect is safe
  useEffect(() => {
    if (activeTab === 'report') {
      fetchTickets();
    }
  }, [activeTab, fetchTickets]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-transparent font-sans">
      {/* ─── Sidebar ─── */}
      <aside className="w-[260px] min-w-[260px] bg-slate-900/60 backdrop-blur-xl flex flex-col p-6 shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-10">
        <div className="flex flex-col mb-8 pb-6 border-b border-slate-700/50 text-center items-center">
          <div className="text-4xl mb-3 drop-shadow-[0_0_12px_rgba(14,165,233,0.4)]">🏛️</div>
          <div className="flex flex-col">
            <h1 className="text-[22px] font-bold text-slate-100 tracking-tight">{t.brandTitle}</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">{t.brandSub}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-2 flex-1">
          <button
            id="tab-companion"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 interactive-btn ${activeTab === 'companion' ? 'bg-sky-500/10 text-sky-400 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.3)]' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            onClick={() => setActiveTab('companion')}
          >
            <span className="text-lg opacity-80">🤖</span>
            {t.navCompanion}
          </button>
          <button
            id="tab-report"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 interactive-btn ${activeTab === 'report' ? 'bg-sky-500/10 text-sky-400 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.3)]' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            onClick={() => setActiveTab('report')}
          >
            <span className="text-lg opacity-80">📋</span>
            {t.navReport}
            {tickets.length > 0 && (
              <span className="ml-auto bg-sky-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.6)]">{tickets.length}</span>
            )}
          </button>
        </nav>
        <div className="mt-auto text-xs text-slate-500 flex items-center justify-center gap-2 pt-4 opacity-70">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          {t.poweredBy}
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent">
        {/* ══════════════ AI COMPANION TAB ══════════════ */}
        {activeTab === 'companion' && (
          <div className="flex flex-col h-full overflow-hidden max-w-4xl w-full mx-auto p-4 md:p-6 lg:p-8">
            <header className="flex items-center justify-between pb-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shadow-lg">🤖</div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100 tracking-tight">{t.chatTitle}</h2>
                  <p className="text-xs text-sky-400 font-medium">
                    {isLoading ? t.typingStatus : t.onlineStatus}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[10px] font-bold text-slate-300 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                Gemini 2.5 Flash
              </div>
            </header>

            {/* ── Language Selector Bar ── */}
            <div className="flex items-center gap-3 py-3 border-b border-slate-700/50 overflow-x-auto">
              <span className="text-slate-400">🌐</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{t.respondIn}</span>
              <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-700/50 shadow-inner">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    id={`lang-btn-${lang.code}`}
                    className={`lang-pill px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${selectedLangCode === lang.code ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    onClick={() => setSelectedLangCode(lang.code)}
                    disabled={isLoading}
                    aria-disabled={isLoading}
                  >
                    {lang.nativeName}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Jargon Smashing Mode Toggle ── */}
            <div className="flex items-center justify-between py-4 border-b border-slate-700/50">
              <div className="flex gap-3">
                <span className="text-xl text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">⚡</span>
                <div>
                  <span className="text-sm font-bold text-slate-200">{t.jargonToggle}</span>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed mt-0.5">{t.jargonDesc}</p>
                </div>
              </div>
              <button
                id="jargon-toggle-btn"
                className={`interactive-btn relative w-12 h-6 rounded-full transition-colors duration-300 ${jargonMode ? 'bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.4)]' : 'bg-slate-700'}`}
                onClick={() => setJargonMode((v) => !v)}
                aria-pressed={jargonMode}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${jargonMode ? 'transform translate-x-6' : ''}`} />
              </button>
            </div>

            {/* ── Network Error Banner (isolated from AI history) ── */}
            {chatNetworkError && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm font-medium my-2 animate-slide-down">
                <span>{chatNetworkError}</span>
                <button
                  className="text-red-400 hover:text-red-300"
                  onClick={() => setChatNetworkError(null)}
                  aria-label="Dismiss error"
                >✕</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 scroll-smooth flex flex-col gap-4" id="chat-messages">
              {renderedMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-end gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'ai' && (
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shadow-md flex-shrink-0">🤖</div>
                  )}
                  <div
                    className={`max-w-[85%] px-5 py-3.5 shadow-lg ${msg.role === 'user'
                        ? 'bg-sky-600 text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm'
                        : 'bg-slate-800/80 backdrop-blur-md text-slate-200 border border-slate-700/50 rounded-t-2xl rounded-br-2xl rounded-bl-sm leading-relaxed'
                      }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.rendered}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm shadow-md flex-shrink-0">👤</div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-end gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shadow-md flex-shrink-0">🤖</div>
                  <div className="max-w-[85%] px-5 py-4 shadow-lg bg-slate-800/80 backdrop-blur-md text-slate-200 border border-slate-700/50 rounded-t-2xl rounded-br-2xl rounded-bl-sm">
                    <div className="flex items-center gap-1.5 h-full">
                      <span className="premium-typing-dot" style={{ animationDelay: '0s' }} />
                      <span className="premium-typing-dot" style={{ animationDelay: '0.2s' }} />
                      <span className="premium-typing-dot" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef}></div>
            </div>

            <div className="mt-4 bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-2 rounded-2xl flex items-center shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <input
                id="chat-input"
                ref={inputRef}
                type="text"
                placeholder={t.chatPlaceholder}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none text-slate-100 text-sm px-4 py-2 outline-none placeholder:text-slate-500"
                disabled={isLoading}
                maxLength={600}
              />
              <button
                id="send-button"
                className={`interactive-btn ml-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${isLoading || !userInput.trim() ? 'bg-slate-700 text-slate-400 opacity-50 cursor-not-allowed' : 'bg-sky-500 text-white hover:bg-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.4)]'}`}
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim()}
              >
                {isLoading ? (
                  <><span className="glowing-spinner !mr-0" /></>
                ) : (
                  <span>{t.sendBtn} ➤</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ REPORT ISSUES TAB ══════════════ */}
        {activeTab === 'report' && (
          <div className="flex-1 flex flex-col overflow-y-auto p-6 md:p-8 gap-6">
            {/* ─ Page Header ─ */}
            <div className="flex items-center gap-4 pb-5 border-b border-slate-700/50">
              <div className="w-[52px] h-[52px] rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-2xl flex-shrink-0 shadow-[0_0_15px_rgba(14,165,233,0.15)]">📋</div>
              <div>
                <h2 className="text-[22px] font-bold text-slate-100 tracking-tight">{t.reportTitle}</h2>
                <p className="text-[13px] text-slate-400 mt-1">{t.reportSub}</p>
              </div>
            </div>

            {/* ─ Success Banner ─ */}
            {submitSuccess && (
               <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium animate-slide-down shadow-[0_4px_12px_rgba(16,185,129,0.1)]">
                <span>✅</span>
                <span>{t.successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 flex-1 min-h-0">
              {/* ─────── FORM PANEL ─────── */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-5 backdrop-blur-xl shadow-lg">
                <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-sky-400 tracking-tight">
                  <span>🗂️</span> {t.newComplaint}
                </h3>
                <form
                  id="report-form"
                  onSubmit={handleSubmitReport}
                  className="flex flex-col gap-5"
                >
                  {/* Category */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="issue-category" className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                      {t.issueCategory}
                    </label>
                    <select
                      id="issue-category"
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all cursor-pointer shadow-inner"
                      required
                    >
                      {ISSUE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_ICONS[cat]} {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Location Description */}
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="location-description"
                      className="text-xs font-bold text-slate-300 uppercase tracking-wide"
                    >
                      {t.locationDesc}
                    </label>
                    <textarea
                      id="location-description"
                      placeholder={t.locationPlaceholder}
                      value={reportLocation}
                      onChange={(e) => setReportLocation(e.target.value)}
                      className="px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all resize-y min-h-[80px] leading-relaxed shadow-inner placeholder:text-slate-500"
                      rows={3}
                      required
                      maxLength={400}
                    />
                  </div>

                  {/* Geolocation */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">{t.gpsCoords}</label>
                    <button
                      id="get-location-btn"
                      className={`interactive-btn text-left px-4 py-3 rounded-xl text-[13px] font-semibold transition-all duration-300 ${geoStatus === 'captured' ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : geoStatus === 'error' || geoStatus === 'denied' ? 'border border-red-500/40 bg-red-500/10 text-red-400' : 'border border-dashed border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'}`}
                      type="button"
                      onClick={handleGetLocation}
                      disabled={geoStatus === 'loading'}
                    >
                      {geoButtonLabel()}
                    </button>
                    {geoStatus === 'captured' && (
                      <p className="text-[11px] text-emerald-400 mt-1">{t.coordsNote}</p>
                    )}
                    {geoStatus === 'denied' && (
                      <p className="text-[11px] text-amber-400 mt-1 leading-relaxed">
                        💡 {t.locationGuide}
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    id="submit-ticket-btn"
                    className={`interactive-btn flex items-center justify-center gap-2 mt-1 px-7 py-3.5 rounded-xl font-bold text-[15px] transition-all duration-300 shadow-[0_6px_20px_rgba(14,165,233,0.3)] ${isSubmitting || !reportLocation.trim() ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400 shadow-none' : 'bg-sky-500 text-white hover:bg-sky-400'}`}
                    type="submit"
                    disabled={isSubmitting || !reportLocation.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="glowing-spinner" /> {t.submitting}
                      </>
                    ) : (
                      t.submitTicket
                    )}
                  </button>
                </form>
              </div>

              {/* ─────── TICKETS DASHBOARD ─────── */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-4 backdrop-blur-xl shadow-lg min-h-0">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-sky-400 tracking-tight">
                    <span>📡</span> {t.activeComplaints}
                  </h3>
                  <button
                    id="refresh-tickets-btn"
                    className={`interactive-btn px-2.5 py-1.5 rounded-lg border border-slate-700 bg-transparent text-slate-300 text-sm transition-all hover:bg-slate-800 ${ticketsLoading ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                    type="button"
                    onClick={fetchTickets}
                    disabled={ticketsLoading}
                    title="Refresh list"
                  >
                    🔄
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1" id="tickets-list">
                  {ticketsLoading ? (
                    <div className="flex flex-col gap-0 p-0">
                      <div className="shimmer-loader" />
                      <div className="shimmer-loader w-[80%]" />
                      <div className="shimmer-loader w-[60%]" />
                      <p className="text-[13px] text-slate-400 text-center mt-2">{t.fetchingComplaints}</p>
                    </div>
                  ) : ticketsFetchError ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm font-medium">
                      <span>{ticketsFetchError}</span>
                      <button
                        className="text-red-400 hover:text-red-300"
                        onClick={() => setTicketsFetchError(null)}
                        aria-label="Dismiss fetch error"
                      >✕</button>
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2.5 py-12">
                      <span className="text-4xl opacity-50">📭</span>
                      <p className="text-[15px] font-semibold text-slate-300">{t.noComplaints}</p>
                      <p className="text-[13px] text-slate-500">{t.beFirst}</p>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <div key={ticket.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col gap-2 transition-colors hover:border-slate-600 animate-float-in min-h-[88px] shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {CATEGORY_ICONS[ticket.category] || '📌'}
                            </span>
                            <span className="text-sm font-bold text-sky-400">
                              {ticket.category}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-0.5 tracking-wide">
                            ● {ticket.status || 'Open'}
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-400 leading-relaxed">
                          📍 {ticket.locationDescription}
                        </p>
                        {ticket.coordinates && (
                          <p className="text-[11px] text-slate-300 font-mono">
                            🌐 {ticket.coordinates.lat?.toFixed(4)},{' '}
                            {ticket.coordinates.lng?.toFixed(4)}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-300">
                          🕐 {formatTimestamp(ticket.createdAt)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
