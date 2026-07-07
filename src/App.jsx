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
import './global.css';

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
  const chatEndRef = useRef(null);
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch tickets when Report tab is active
  // fetchTickets is stable (empty dep array) so this effect is safe
  useEffect(() => {
    if (activeTab === 'report') {
      fetchTickets();
    }
  }, [activeTab, fetchTickets]);

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

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div style={styles.appShell} className="app-shell">
      {/* ─── Sidebar ─── */}
      <aside style={styles.sidebar} className="sidebar">
        <div style={styles.brandSection} className="brand-section">
          <div style={styles.logoIcon} className="logo-icon">🏛️</div>
          <div className="brand-title-container">
            <h1 style={styles.brandTitle}>{t.brandTitle}</h1>
            <p style={styles.brandSub}>{t.brandSub}</p>
          </div>
        </div>
        <nav style={styles.nav} className="nav">
          <button
            id="tab-companion"
            className="nav-btn interactive-btn"
            onClick={() => setActiveTab('companion')}
            style={{
              ...styles.navBtn,
              ...(activeTab === 'companion' ? styles.navBtnActive : {}),
            }}
          >
            <span style={styles.navIcon}>🤖</span>
            {t.navCompanion}
          </button>
          <button
            id="tab-report"
            className="nav-btn interactive-btn"
            onClick={() => setActiveTab('report')}
            style={{
              ...styles.navBtn,
              ...(activeTab === 'report' ? styles.navBtnActive : {}),
            }}
          >
            <span style={styles.navIcon}>📋</span>
            {t.navReport}
            {tickets.length > 0 && (
              <span style={styles.ticketBadge}>{tickets.length}</span>
            )}
          </button>
        </nav>
        <div style={styles.sidebarFooter} className="sidebar-footer">
          <span style={styles.footerDot} />
          {t.poweredBy}
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main style={styles.mainContent}>
        {/* ══════════════ AI COMPANION TAB ══════════════ */}
        {activeTab === 'companion' && (
          <div style={styles.chatContainer}>
            <header style={styles.chatHeader} className="chat-header">
              <div style={styles.chatHeaderLeft}>
                <div style={styles.aiAvatar}>🤖</div>
                <div>
                  <h2 style={styles.chatTitle}>{t.chatTitle}</h2>
                  <p style={styles.chatSubtitle}>
                    {isLoading ? t.typingStatus : t.onlineStatus}
                  </p>
                </div>
              </div>
              <div style={styles.headerStatusChip}>
                <span style={styles.headerStatusDot} />
                Gemini 2.5 Flash
              </div>
            </header>

            {/* ── Language Selector Bar ── */}
            <div style={styles.langBar} className="lang-bar">
              <span style={styles.langBarIcon}>🌐</span>
              <span style={styles.langBarLabel}>{t.respondIn}</span>
              <div style={styles.langBarOptions}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    id={`lang-btn-${lang.code}`}
                    className="lang-pill"
                    onClick={() => setSelectedLangCode(lang.code)}
                    disabled={isLoading}
                    aria-disabled={isLoading}
                    style={{
                      ...styles.langPill,
                      ...(selectedLangCode === lang.code ? styles.langPillActive : {}),
                    }}
                  >
                    {lang.nativeName}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Jargon Smashing Mode Toggle ── */}
            <div style={styles.jargonBar} className="jargon-bar">
              <div style={styles.jargonLeft}>
                <span style={styles.jargonIcon}>⚡</span>
                <div>
                  <span style={styles.jargonLabel}>{t.jargonToggle}</span>
                  <p style={styles.jargonDesc}>{t.jargonDesc}</p>
                </div>
              </div>
              <button
                id="jargon-toggle-btn"
                className="interactive-btn"
                onClick={() => setJargonMode((v) => !v)}
                style={{
                  ...styles.toggleBtn,
                  ...(jargonMode ? styles.toggleBtnOn : {}),
                }}
                aria-pressed={jargonMode}
              >
                <span style={{
                  ...styles.toggleKnob,
                  ...(jargonMode ? styles.toggleKnobOn : {}),
                }} />
              </button>
            </div>

            {/* ── Network Error Banner (isolated from AI history) ── */}
            {chatNetworkError && (
              <div style={styles.errorBanner}>
                <span>{chatNetworkError}</span>
                <button
                  style={styles.errorDismiss}
                  onClick={() => setChatNetworkError(null)}
                  aria-label="Dismiss error"
                >✕</button>
              </div>
            )}

            <div style={styles.messagesContainer} className="messages-container" id="chat-messages">
              {renderedMessages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.messageBubbleRow,
                    justifyContent:
                      msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'ai' && (
                    <div style={styles.bubbleAvatar}>🤖</div>
                  )}
                  <div
                    style={{
                      ...styles.messageBubble,
                      ...(msg.role === 'user'
                        ? styles.userBubble
                        : styles.aiBubble),
                    }}
                  >
                    <p style={styles.bubbleText}>{msg.rendered}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div style={styles.bubbleAvatarUser}>👤</div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div style={styles.messageBubbleRow}>
                  <div style={styles.bubbleAvatar}>🤖</div>
                  {/* Typing bubble matches messageBubble spatial params for zero CLS */}
                  <div style={{ ...styles.messageBubble, ...styles.aiBubble, ...styles.typingBubble }}>
                    <div style={styles.typingIndicator}>
                      <span className="premium-typing-dot" style={{ animationDelay: '0s' }} />
                      <span className="premium-typing-dot" style={{ animationDelay: '0.2s' }} />
                      <span className="premium-typing-dot" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={styles.chatInputBar} className="chat-input-bar">
              <input
                id="chat-input"
                ref={inputRef}
                type="text"
                placeholder={t.chatPlaceholder}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={styles.chatInput}
                disabled={isLoading}
                maxLength={600}
              />
              <button
                id="send-button"
                className="interactive-btn"
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim()}
                style={{
                  ...styles.sendBtn,
                  ...(isLoading || !userInput.trim()
                    ? styles.sendBtnDisabled
                    : {}),
                }}
              >
                {isLoading ? (
                  <><span className="glowing-spinner" style={{marginRight: 0}} /></>
                ) : (
                  <span>{t.sendBtn} ➤</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ REPORT ISSUES TAB ══════════════ */}
        {activeTab === 'report' && (
          <div style={styles.reportContainer} className="report-container">
            {/* ─ Page Header ─ */}
            <div style={styles.reportPageHeader}>
              <div style={styles.reportHeaderIcon}>📋</div>
              <div>
                <h2 style={styles.reportPageTitle}>{t.reportTitle}</h2>
                <p style={styles.reportPageSub}>{t.reportSub}</p>
              </div>
            </div>

            {/* ─ Success Banner ─ */}
            {submitSuccess && (
              <div style={styles.successBanner}>
                <span>✅</span>
                <span>{t.successMsg}</span>
              </div>
            )}

            <div style={styles.reportLayout} className="report-layout">
              {/* ─────── FORM PANEL ─────── */}
              <div style={styles.formPanel}>
                <h3 style={styles.panelTitle}>
                  <span>🗂️</span> {t.newComplaint}
                </h3>
                <form
                  id="report-form"
                  onSubmit={handleSubmitReport}
                  style={styles.form}
                >
                  {/* Category */}
                  <div style={styles.formGroup}>
                    <label htmlFor="issue-category" style={styles.formLabel}>
                      {t.issueCategory}
                    </label>
                    <select
                      id="issue-category"
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      style={styles.formSelect}
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
                  <div style={styles.formGroup}>
                    <label
                      htmlFor="location-description"
                      style={styles.formLabel}
                    >
                      {t.locationDesc}
                    </label>
                    <textarea
                      id="location-description"
                      placeholder={t.locationPlaceholder}
                      value={reportLocation}
                      onChange={(e) => setReportLocation(e.target.value)}
                      style={styles.formTextarea}
                      rows={3}
                      required
                      maxLength={400}
                    />
                  </div>

                  {/* Geolocation */}
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>{t.gpsCoords}</label>
                    <button
                      id="get-location-btn"
                      className="interactive-btn"
                      type="button"
                      onClick={handleGetLocation}
                      disabled={geoStatus === 'loading'}
                      style={{
                        ...styles.geoBtn,
                        ...(geoStatus === 'captured'
                          ? styles.geoBtnCaptured
                          : {}),
                        ...(geoStatus === 'error' || geoStatus === 'denied'
                          ? styles.geoBtnError
                          : {}),
                      }}
                    >
                      {geoButtonLabel()}
                    </button>
                    {geoStatus === 'captured' && (
                      <p style={styles.geoNote}>{t.coordsNote}</p>
                    )}
                    {geoStatus === 'denied' && (
                      <p style={styles.geoDeniedNote}>
                        💡 {t.locationGuide}
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    id="submit-ticket-btn"
                    className="interactive-btn"
                    type="submit"
                    disabled={isSubmitting || !reportLocation.trim()}
                    style={{
                      ...styles.submitBtn,
                      ...(isSubmitting || !reportLocation.trim()
                        ? styles.submitBtnDisabled
                        : {}),
                    }}
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
              <div style={styles.dashboardPanel}>
                <div style={styles.dashboardHeader}>
                  <h3 style={styles.panelTitle}>
                    <span>📡</span> {t.activeComplaints}
                  </h3>
                  <button
                    id="refresh-tickets-btn"
                    className="interactive-btn"
                    type="button"
                    onClick={fetchTickets}
                    disabled={ticketsLoading}
                    style={{
                      ...styles.refreshBtn,
                      ...(ticketsLoading ? styles.refreshBtnDisabled : {}),
                    }}
                    title="Refresh list"
                  >
                    🔄
                  </button>
                </div>

                <div style={styles.ticketsList} id="tickets-list">
                  {ticketsLoading ? (
                    <div style={styles.ticketsLoadingState}>
                      {/* Shimmer skeletons match real ticket card height — CLS = 0 */}
                      <div className="shimmer-loader" />
                      <div className="shimmer-loader" style={{ width: '80%' }} />
                      <div className="shimmer-loader" style={{ width: '60%' }} />
                      <p style={styles.loadingText}>{t.fetchingComplaints}</p>
                    </div>
                  ) : ticketsFetchError ? (
                    <div style={styles.inlineErrorBanner}>
                      <span>{ticketsFetchError}</span>
                      <button
                        style={styles.errorDismiss}
                        onClick={() => setTicketsFetchError(null)}
                        aria-label="Dismiss fetch error"
                      >✕</button>
                    </div>
                  ) : tickets.length === 0 ? (
                    <div style={styles.emptyState}>
                      <span style={styles.emptyIcon}>📭</span>
                      <p style={styles.emptyText}>{t.noComplaints}</p>
                      <p style={styles.emptySubText}>{t.beFirst}</p>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <div key={ticket.id} style={styles.ticketCard}>
                        <div style={styles.ticketCardTop}>
                          <div style={styles.ticketCategory}>
                            <span style={styles.categoryEmoji}>
                              {CATEGORY_ICONS[ticket.category] || '📌'}
                            </span>
                            <span style={styles.categoryName}>
                              {ticket.category}
                            </span>
                          </div>
                          <span style={styles.statusBadge}>
                            ● {ticket.status || 'Open'}
                          </span>
                        </div>
                        <p style={styles.ticketLocation}>
                          📍 {ticket.locationDescription}
                        </p>
                        {ticket.coordinates && (
                          <p style={styles.ticketCoords}>
                            🌐 {ticket.coordinates.lat?.toFixed(4)},{' '}
                            {ticket.coordinates.lng?.toFixed(4)}
                          </p>
                        )}
                        <p style={styles.ticketTime}>
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

// ═══════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════

const styles = {
  // ─── App Shell ───
  appShell: {
    display: 'flex',
    height: '100vh',
    background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1040 50%, #0f172a 100%)',
    fontFamily: "'Inter', sans-serif",
  },

  // ─── Sidebar ───
  sidebar: {
    width: '260px',
    minWidth: '260px',
    background: 'rgba(15, 10, 40, 0.85)',
    backdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(139, 92, 246, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
  },
  brandSection: {
    textAlign: 'center',
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
  },
  // fontSize uses rem for system-scale compliance
  logoIcon: { fontSize: '2.25rem', marginBottom: '0.5rem' },
  brandTitle: {
    fontSize: '1.375rem',   // 22px → rem
    fontWeight: '700',
    background: 'linear-gradient(135deg, #a78bfa, #7c3aed, #6d28d9)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.5px',
  },
  brandSub: {
    fontSize: '0.6875rem',  // 11px → rem
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1 on #0f0a28 dark glass
    marginTop: '4px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '12px',
    background: 'transparent',
    color: '#a0a0c0',
    fontSize: '0.875rem',   // 14px → rem
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontFamily: "'Inter', sans-serif",
    position: 'relative',
  },
  navBtnActive: {
    background:
      'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(109, 40, 217, 0.15))',
    color: '#c4b5fd',
    boxShadow: 'inset 0 0 0 1px rgba(139, 92, 246, 0.3)',
  },
  navIcon: { fontSize: '1.125rem' },
  ticketBadge: {
    marginLeft: 'auto',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: '#fff',
    borderRadius: '20px',
    padding: '1px 8px',
    fontSize: '0.6875rem',  // 11px → rem
    fontWeight: '700',
  },
  sidebarFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.6875rem',  // 11px → rem
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    paddingTop: '16px',
    borderTop: '1px solid rgba(139, 92, 246, 0.1)',
  },
  footerDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)',
  },

  // ─── Main Content ───
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // ─── Chat ───
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 28px',
    background: 'rgba(15, 10, 40, 0.6)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
    flexShrink: 0,
  },
  chatHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  headerStatusChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    fontSize: '0.75rem',    // 12px → rem
    fontWeight: '600',
    color: '#a78bfa',
    letterSpacing: '0.2px',
  },
  headerStatusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 7px rgba(34, 197, 94, 0.6)',
    flexShrink: 0,
  },
  aiAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.375rem',   // 22px → rem
    boxShadow: '0 4px 15px rgba(124, 58, 237, 0.35)',
    flexShrink: 0,
  },
  chatTitle: {
    fontSize: '1.0625rem',  // 17px → rem
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: '-0.3px',
  },
  chatSubtitle: {
    fontSize: '0.75rem',    // 12px → rem
    color: '#22c55e',
    marginTop: '2px',
    fontWeight: '500',
  },

  // ── Language Bar ──
  langBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 28px',
    background: 'rgba(10, 7, 30, 0.45)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(139, 92, 246, 0.08)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  langBarIcon: { fontSize: '1rem', flexShrink: 0 },
  langBarLabel: {
    fontSize: '0.75rem',    // 12px → rem
    fontWeight: '600',
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  langBarOptions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  langPill: {
    padding: '5px 14px',
    borderRadius: '20px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    background: 'transparent',
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    fontSize: '0.75rem',    // 12px → rem
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap',
  },
  langPillActive: {
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(109, 40, 217, 0.2))',
    border: '1px solid rgba(139, 92, 246, 0.5)',
    color: '#c4b5fd',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.2)',
  },

  // ── Jargon Smashing Mode bar ──
  jargonBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 28px',
    background: 'rgba(139, 92, 246, 0.04)',
    borderBottom: '1px solid rgba(139, 92, 246, 0.08)',
    flexShrink: 0,
  },
  jargonLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  jargonIcon: { fontSize: '1rem', marginTop: '1px' },
  jargonLabel: {
    fontSize: '0.8125rem',  // 13px → rem
    fontWeight: '700',
    color: '#c4b5fd',
    display: 'block',
  },
  jargonDesc: {
    fontSize: '0.6875rem',  // 11px → rem
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1 on dark panel background
    marginTop: '2px',
    lineHeight: 1.4,
    maxWidth: '520px',
  },
  toggleBtn: {
    position: 'relative',
    width: '42px',
    height: '24px',
    borderRadius: '12px',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    background: 'rgba(30, 27, 75, 0.6)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'all 0.25s ease',
  },
  toggleBtnOn: {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    border: '1px solid #7c3aed',
    boxShadow: '0 0 12px rgba(124, 58, 237, 0.4)',
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#cbd5e1', // WCAG AA compliant on dark panel bg
    transition: 'all 0.25s ease',
  },
  toggleKnobOn: {
    left: '21px',
    background: '#ffffff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },

  // ── Error Banner (network errors — isolated from AI history) ──
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 20px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderLeft: '3px solid #ef4444',
    color: '#fca5a5',
    fontSize: '0.8125rem',  // 13px → rem
    flexShrink: 0,
    animation: 'slide-down 0.3s ease-out',
  },
  // Inline error inside the tickets list
  inlineErrorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '12px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderLeft: '3px solid #ef4444',
    color: '#fca5a5',
    fontSize: '0.8125rem',  // 13px → rem
    animation: 'slide-down 0.3s ease-out',
  },
  errorDismiss: {
    background: 'transparent',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '0.875rem',   // 14px → rem
    padding: '2px 6px',
    borderRadius: '4px',
    flexShrink: 0,
    fontFamily: "'Inter', sans-serif",
  },

  // ── Messages ──
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  messageBubbleRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    animation: 'float-in 0.3s ease-out',
  },
  bubbleAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    flexShrink: 0,
  },
  bubbleAvatarUser: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    flexShrink: 0,
  },
  messageBubble: {
    maxWidth: '70%',
    padding: '14px 18px',
    borderRadius: '18px',
    lineHeight: '1.6',
    // Explicit min-height aligns typing bubble spatially with real text cards
    minHeight: '48px',
  },
  aiBubble: {
    background: 'rgba(30, 27, 75, 0.6)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderBottomLeftRadius: '4px',
    color: '#e2e8f0',
  },
  userBubble: {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    borderBottomRightRadius: '4px',
    color: '#ffffff',
    boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)',
  },
  // Typing bubble matches messageBubble size to prevent CLS
  typingBubble: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '48px',
  },
  bubbleText: {
    fontSize: '0.875rem',   // 14px → rem
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  typingIndicator: {
    display: 'flex',
    gap: '6px',
    padding: '4px 0',
    alignItems: 'center',
  },
  chatInputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 28px 20px',
    background: 'rgba(15, 10, 40, 0.6)',
    backdropFilter: 'blur(16px)',
    borderTop: '1px solid rgba(139, 92, 246, 0.1)',
  },
  chatInput: {
    flex: 1,
    padding: '14px 20px',
    borderRadius: '14px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    background: 'rgba(30, 27, 75, 0.5)',
    color: '#e2e8f0',
    fontSize: '0.875rem',   // 14px → rem
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  sendBtn: {
    padding: '14px 24px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: '#ffffff',
    fontSize: '0.875rem',   // 14px → rem
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 15px rgba(124, 58, 237, 0.35)',
    whiteSpace: 'nowrap',
  },
  sendBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },

  // ─── Report Issues ───
  reportContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    padding: '28px 32px',
    gap: '24px',
  },
  reportPageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    paddingBottom: '20px',
    borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
  },
  reportHeaderIcon: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(109, 40, 217, 0.2))',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.625rem',   // 26px → rem
    flexShrink: 0,
  },
  reportPageTitle: {
    fontSize: '1.375rem',   // 22px → rem
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: '-0.4px',
  },
  reportPageSub: {
    fontSize: '0.8125rem',  // 13px → rem
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    marginTop: '4px',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    borderRadius: '14px',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    color: '#4ade80',
    fontSize: '0.875rem',   // 14px → rem
    fontWeight: '500',
    animation: 'slide-down 0.3s ease-out',
  },
  reportLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.2fr',
    gap: '24px',
    flex: 1,
    minHeight: 0,
  },
  formPanel: {
    background: 'rgba(15, 10, 40, 0.5)',
    border: '1px solid rgba(139, 92, 246, 0.12)',
    borderRadius: '20px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    backdropFilter: 'blur(12px)',
  },
  panelTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.9375rem',  // 15px → rem
    fontWeight: '700',
    color: '#c4b5fd',
    letterSpacing: '-0.2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '0.75rem',    // 12px → rem
    fontWeight: '600',
    color: '#e2e8f0',       // WCAG AA ≥ 4.5:1
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  formSelect: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    background: 'rgba(30, 27, 75, 0.6)',
    color: '#e2e8f0',
    fontSize: '0.875rem',   // 14px → rem
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  formTextarea: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    background: 'rgba(30, 27, 75, 0.6)',
    color: '#e2e8f0',
    fontSize: '0.875rem',   // 14px → rem
    fontFamily: "'Inter', sans-serif",
    resize: 'vertical',
    minHeight: '80px',
    outline: 'none',
    transition: 'border-color 0.2s',
    lineHeight: 1.6,
  },
  geoBtn: {
    padding: '12px 18px',
    borderRadius: '12px',
    border: '1px dashed rgba(139, 92, 246, 0.4)',
    background: 'rgba(30, 27, 75, 0.4)',
    color: '#a78bfa',
    fontSize: '0.8125rem',  // 13px → rem
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.25s ease',
    textAlign: 'left',
  },
  geoBtnCaptured: {
    border: '1px solid rgba(34, 197, 94, 0.4)',
    background: 'rgba(34, 197, 94, 0.08)',
    color: '#4ade80',
  },
  geoBtnError: {
    border: '1px solid rgba(239, 68, 68, 0.4)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: '#f87171',
  },
  geoNote: {
    fontSize: '0.6875rem',  // 11px → rem
    color: '#4ade80',
    marginTop: '4px',
  },
  geoDeniedNote: {
    fontSize: '0.6875rem',  // 11px → rem
    color: '#fbbf24',
    marginTop: '4px',
    lineHeight: 1.5,
  },
  submitBtn: {
    padding: '14px 28px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: '#ffffff',
    fontSize: '0.9375rem',  // 15px → rem
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.25s ease',
    boxShadow: '0 6px 20px rgba(124, 58, 237, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  submitBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },

  // ─ Dashboard Panel ─
  dashboardPanel: {
    background: 'rgba(15, 10, 40, 0.5)',
    border: '1px solid rgba(139, 92, 246, 0.12)',
    borderRadius: '20px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backdropFilter: 'blur(12px)',
    minHeight: 0,
  },
  dashboardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshBtn: {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    background: 'transparent',
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    fontSize: '0.875rem',   // 14px → rem
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'Inter', sans-serif",
  },
  refreshBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
  ticketsList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingRight: '4px',
  },
  ticketsLoadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0',
    padding: '0',
  },
  loadingText: { fontSize: '0.8125rem', color: '#cbd5e1', textAlign: 'center', marginTop: '8px' }, // WCAG AA
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '48px 0',
  },
  emptyIcon: { fontSize: '2.5rem', opacity: 0.5 },
  emptyText: {
    fontSize: '0.9375rem',  // 15px → rem
    fontWeight: '600',
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
  },
  emptySubText: { fontSize: '0.8125rem', color: '#3d3d5a' },
  ticketCard: {
    padding: '16px',
    borderRadius: '14px',
    background: 'rgba(30, 27, 75, 0.4)',
    border: '1px solid rgba(139, 92, 246, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    transition: 'border-color 0.2s',
    animation: 'float-in 0.3s ease-out',
    // Explicit min-height keeps skeleton and real card heights in sync → CLS = 0
    minHeight: '88px',
  },
  ticketCardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketCategory: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryEmoji: { fontSize: '1.125rem' },
  categoryName: {
    fontSize: '0.875rem',   // 14px → rem
    fontWeight: '700',
    color: '#c4b5fd',
  },
  statusBadge: {
    fontSize: '0.6875rem',  // 11px → rem
    fontWeight: '700',
    color: '#4ade80',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: '20px',
    padding: '3px 10px',
    letterSpacing: '0.3px',
  },
  ticketLocation: {
    fontSize: '0.8125rem',  // 13px → rem
    color: '#a0a0c0',
    lineHeight: 1.5,
  },
  ticketCoords: {
    fontSize: '0.6875rem',  // 11px → rem
    color: '#cbd5e1',       // WCAG AA ≥ 4.5:1
    fontFamily: 'monospace',
  },
  ticketTime: { fontSize: '0.6875rem', color: '#cbd5e1' }, // WCAG AA
};

export default App;
