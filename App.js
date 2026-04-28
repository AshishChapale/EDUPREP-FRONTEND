import React, { useState, useEffect } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import './App.css';

function App() {
  const { user } = useUser(); // Grab the logged-in Clerk user!
  const [activeTab, setActiveTab] = useState('dashboard');

  // CORE STATS
  const [stats, setStats] = useState({ quizzesTaken: 0, avgScore: 0, streak: 1, totalQuestions: 0, totalCorrect: 0 });
  const [topicStats, setTopicStats] = useState({});

  // QUIZ STATE
  const [quizPhase, setQuizPhase] = useState('setup');
  const [notes, setNotes] = useState('');
  const [stream, setStream] = useState('Computer Science / IT');
  const [subject, setSubject] = useState('Data Structures & Algorithms');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('Medium'); // Default
  const [qCount, setQCount] = useState(10);

  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);

  // ADVANCED TRACKING
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [questionLog, setQuestionLog] = useState([]);
  const [qStartTime, setQStartTime] = useState(0);

  // LOAD DATA ON BOOT (Fallback to local storage if needed)
  // --- SYNC DATA FROM CLOUD ON LOGIN ---
  // --- SYNC DATA FROM CLOUD ON LOGIN ---
  useEffect(() => {
    const fetchCloudData = async () => {
      if (user) {
        try {
          // Change from hardcoded URL to:
          const API_URL = import.meta.env.VITE_API_URL || 'https://eduprep-ms15.onrender.com';
          const response = await fetch(`${API_URL}/api/user-stats/${user.id}`); if (response.ok) {
            const data = await response.json();

            // --- STREAK LOGIC STARTS HERE ---
            let fetchedStats = data.stats || { quizzesTaken: 0, avgScore: 0, streak: 1, totalQuestions: 0, totalCorrect: 0 };
            const today = new Date().toDateString();
            const lastActive = fetchedStats.lastActiveDate;

            if (lastActive) {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);

              if (lastActive === yesterday.toDateString()) {
                // Kept the streak alive!
                fetchedStats.streak += 1;
              } else if (lastActive !== today) {
                // Missed a day, reset streak
                fetchedStats.streak = 1;
              }
            }
            // Save today's date so we know they were active today
            fetchedStats.lastActiveDate = today;
            // --- STREAK LOGIC ENDS HERE ---

            setStats(fetchedStats);
            setTopicStats(data.topicStats || {});
          }
        } catch (error) { console.error("Cloud sync failed", error); }
      }
    };
    fetchCloudData();
  }, [user]);
  // -------------------------------------

  // TIMER LOGIC
  useEffect(() => {
    let interval = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      finishQuiz();
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, timeLeft]);

  // GENERATE QUIZ
  const handleGenerate = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    try {
      // To this (This tells React to use the Vercel setting if it exists):
      const API_URL = import.meta.env.VITE_API_URL || 'https://eduprep-ms15.onrender.com';
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, stream, subject, topic, difficulty, count: qCount }),
      });
      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      setQuestions(data);
      setQuizPhase('active');
      setCurrentQ(0);
      setScore(0);
      setIsAnswered(false);
      setSelectedOpt(null);
      setConfidence(null);
      setQuestionLog([]);

      setTimeLeft(data.length * 90);
      setTimerActive(true);
      setQStartTime(Date.now());

    } catch (error) {
      alert("Failed to connect to backend. Is server.js running?");
    } finally {
      setLoading(false);
    }
  };

  // HANDLE ANSWER
  const handleAnswer = (optIndex, optionText) => {
    if (isAnswered) return;
    setSelectedOpt(optIndex);
    setIsAnswered(true);

    const currentQData = questions[currentQ];
    const correctAnswer = String(currentQData.answer || currentQData.correctAnswer || "").toLowerCase().trim();
    const isCorrect = String(optionText).toLowerCase().trim().includes(correctAnswer) || correctAnswer.includes(String(optionText).toLowerCase().trim());

    if (isCorrect) setScore(s => s + 1);

    const timeTaken = Math.round((Date.now() - qStartTime) / 1000);
    setQuestionLog(prev => [...prev, {
      question: currentQData.question,
      options: currentQData.options,
      userAns: optionText,
      correctAns: currentQData.answer,
      isCorrect: isCorrect,
      confidence: null,
      timeTaken: timeTaken,
      explanation: currentQData.explanation || "System determined this based on technical logic."
    }]);
  };

  const handleConfidence = (val) => {
    setConfidence(val);
    const newLog = [...questionLog];
    if (newLog.length > 0) newLog[newLog.length - 1].confidence = val;
    setQuestionLog(newLog);
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setIsAnswered(false);
      setSelectedOpt(null);
      setConfidence(null);
      setQStartTime(Date.now());
    } else {
      finishQuiz();
    }
  };

  // FINISH QUIZ & SAVE TO MONGODB
  const finishQuiz = async () => {
    setTimerActive(false);
    const newStats = {
      ...stats,
      quizzesTaken: stats.quizzesTaken + 1,
      // Add this new line so it saves the date to the database!
      lastActiveDate: new Date().toDateString()
    }; setStats(newStats);

    const topicKey = `${subject}:${topic.trim() || 'General'}`;
    const newTopicStats = { ...topicStats };
    if (!newTopicStats[topicKey]) newTopicStats[topicKey] = { correct: 0, total: 0 };
    newTopicStats[topicKey].correct += score;
    newTopicStats[topicKey].total += questions.length;
    setTopicStats(newTopicStats);

    // Keep saving locally as a fast UI backup
    localStorage.setItem('eduprep_db', JSON.stringify(newStats));
    localStorage.setItem('eduprep_topics', JSON.stringify(newTopicStats));

    // --- FIRE DATA TO MONGODB ---
    if (user) {
      try {
        console.log("Sending score to database for user:", user.id);
        // Change from hardcoded URL to:
        const API_URL = import.meta.env.VITE_API_URL || 'https://eduprep-ms15.onrender.com';
        const response = await fetch(`${API_URL}/api/save-score`, {
          method: 'POST',
          // ... rest of your headers and body          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerkUserId: user.id,
            stats: newStats,
            topicStats: newTopicStats
          })
        });
        const result = await response.json();
        console.log("Server response:", result.message);
      } catch (err) {
        console.error("Failed to save to cloud:", err);
      }
    } else {
      console.log("User is not signed in. Score saved locally only.");
    }
    // ---------------------------------

    setQuizPhase('result');
  };

  // --- ANALYTICS ENGINE ---
  const topicEntries = Object.entries(topicStats);
  let strongTopics = [], avgTopics = [], weakTopics = [];
  const subjectAgg = {};

  topicEntries.forEach(([key, data]) => {
    const pct = Math.round((data.correct / data.total) * 100);
    const [sub, top] = key.split(':');
    if (pct >= 75) strongTopics.push({ name: top, pct, sub });
    else if (pct >= 50) avgTopics.push({ name: top, pct, sub });
    else weakTopics.push({ name: top, pct, sub });

    if (!subjectAgg[sub]) subjectAgg[sub] = { correct: 0, total: 0 };
    subjectAgg[sub].correct += data.correct;
    subjectAgg[sub].total += data.total;
  });

  const totalT = topicEntries.length || 1;
  const circ = 2 * Math.PI * 46;
  const sDash = (strongTopics.length / totalT) * circ;
  const aDash = (avgTopics.length / totalT) * circ;
  const wDash = (weakTopics.length / totalT) * circ;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo"><div className="logo-text">Edu<span>Prep</span></div><div className="logo-sub">Engineering Platform</div></div>
        <nav className="nav">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`nav-item ${activeTab === 'quiz' ? 'active' : ''}`} onClick={() => { setActiveTab('quiz'); setQuizPhase('setup'); }}>⚡ Practice Quiz</button>
          <button className={`nav-item ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>📅 Study Plan</button>
          <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>📈 Analytics</button>
        </nav>
      </aside>

      <main className="main">

        {/* --- UNIVERSAL CLERK AUTH HEADER --- */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '15px 30px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={{ padding: '8px 24px', backgroundColor: '#1B4FD8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 2px 4px rgba(27,79,216,0.2)' }}>
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
        {/* ----------------------------------- */}

        <div className="topbar">
          <div className="topbar-left"><h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1><p>Welcome! Let's optimize your engineering studies.</p></div>
          <div className="streak-pill">🔥 {stats.streak}-day streak</div>
        </div>

        {/* --- DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="page">
            <div className="stats-grid">
              <div className="stat-card accent"><div className="s-label">Overall Readiness</div><div className="s-value">{stats.avgScore || 0}%</div></div>
              <div className="stat-card"><div className="s-label">Quizzes Taken</div><div className="s-value" style={{ color: 'var(--text)' }}>{stats.quizzesTaken}</div></div>
              <div className="stat-card"><div className="s-label">Topics Attempted</div><div className="s-value" style={{ color: 'var(--text)' }}>{topicEntries.length}</div></div>
              <div className="stat-card"><div className="s-label">Total Questions</div><div className="s-value" style={{ color: 'var(--text)' }}>{stats.totalQuestions}</div></div>
            </div>
            <div className="section-title">Quick Actions</div>
            <div className="card" style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Generate AI Practice Exam</h3>
                <p style={{ color: '#64748B', fontSize: '14px', lineHeight: '1.6' }}>Convert your raw syllabus, PDFs, and notes into personalized multiple-choice questions instantly.</p>
                <button className="btn btn-primary" style={{ marginTop: '15px' }} onClick={() => { setActiveTab('quiz'); setQuizPhase('setup'); }}>⚡ Start Practice →</button>
              </div>
            </div>
          </div>
        )}

        {/* --- QUIZ HUB --- */}
        {activeTab === 'quiz' && (
          <div className="page">
            {quizPhase === 'setup' && (
              <div style={{ maxWidth: '720px' }}>
                <div className="card">
                  <div className="section-title" style={{ marginTop: 0 }}>Quiz Configuration</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748B', marginBottom: '5px' }}>STREAM</label><select className="form-input" style={{ marginBottom: 0 }} value={stream} onChange={(e) => setStream(e.target.value)}><option>Computer Science / IT</option><option>Electronics & Electrical</option></select></div>
                    <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748B', marginBottom: '5px' }}>SUBJECT</label><select className="form-input" style={{ marginBottom: 0 }} value={subject} onChange={(e) => setSubject(e.target.value)}><option>Data Structures & Algorithms</option><option>Operating Systems</option><option>Computer Networks</option><option>DBMS</option></select></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                    <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748B', marginBottom: '5px' }}>TOPIC (Optional)</label><input className="form-input" style={{ marginBottom: 0 }} placeholder="e.g. Binary Trees, 80386..." value={topic} onChange={(e) => setTopic(e.target.value)} /></div>

                    {/* RESTORED EASY/MEDIUM/HARD DROPDOWN */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748B', marginBottom: '5px' }}>DIFFICULTY</label>
                      <select className="form-input" style={{ marginBottom: 0 }} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                      </select>
                    </div>
                    {/* ----------------------------------- */}

                  </div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748B', marginBottom: '5px' }}>SYLLABUS CONTEXT</label>
                  <textarea className="form-input" rows="5" placeholder="Paste your lecture slides, notes, or textbook paragraphs here..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <select className="form-input" style={{ width: '100px', marginBottom: 0 }} value={qCount} onChange={(e) => setQCount(e.target.value)}><option value="5">5 Qs</option><option value="10">10 Qs</option></select>
                    <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !notes.trim()} style={{ flex: 1 }}>{loading ? '⚙️ Processing Context & Generating...' : '📝 Generate Practice Exam'}</button>
                  </div>
                </div>
              </div>
            )}

            {quizPhase === 'active' && questions.length > 0 && (
              <div style={{ maxWidth: '700px' }}>
                <div className="quiz-meta-bar">
                  <span style={{ fontWeight: '600', color: '#1B4FD8', fontSize: '14px' }}>{subject} {topic && `- ${topic}`}</span>
                  <div className={`quiz-timer ${timeLeft < 60 ? 'warning' : ''}`}>
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </div>
                </div>

                <div className="question-card">
                  <div className="q-badges">
                    <span className="q-badge" style={{ background: 'var(--blue-pale)', color: 'var(--blue)' }}>{questions[currentQ].type || 'Conceptual'}</span>
                    <span className="q-badge" style={{ background: 'var(--warn)', color: 'var(--warn-text)' }}>{questions[currentQ].difficulty || difficulty}</span>
                  </div>
                  <div className="q-num">Question {currentQ + 1} of {questions.length}</div>
                  <div className="q-text">{questions[currentQ].question}</div>
                  <div className="q-options">
                    {questions[currentQ].options.map((opt, i) => {
                      let btnClass = "q-opt";
                      const correctAnswer = String(questions[currentQ].answer || questions[currentQ].correctAnswer || "").toLowerCase().trim();
                      if (isAnswered) {
                        const isCorrectOpt = String(opt).toLowerCase().trim().includes(correctAnswer) || correctAnswer.includes(String(opt).toLowerCase().trim());
                        if (isCorrectOpt) btnClass += " correct";
                        else if (selectedOpt === i) btnClass += " wrong";
                      }
                      return (
                        <div key={i} className={btnClass} onClick={() => handleAnswer(i, opt)}>
                          <div className="opt-letter">{['A', 'B', 'C', 'D'][i]}</div>
                          <span>{String(opt).replace(/^[A-D][.)]\s*/, '')}</span>
                        </div>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div className="confidence-row">
                      <span className="confidence-label">How sure were you?</span>
                      <button className={`conf-btn ${confidence === 'sure' ? 'active-sure' : ''}`} onClick={() => handleConfidence('sure')}>✓ Sure</button>
                      <button className={`conf-btn ${confidence === 'guess' ? 'active-guess' : ''}`} onClick={() => handleConfidence('guess')}>? Guessed</button>
                    </div>
                  )}
                </div>

                {isAnswered && (
                  <div className="card" style={{ background: '#f8fafc', borderColor: '#e2e8f0', marginTop: '15px' }}>
                    <strong style={{ color: '#334155' }}>System Explanation:</strong>
                    <p style={{ fontSize: '14px', marginTop: '8px', color: '#475569' }}>{questions[currentQ].explanation || `The correct answer is ${questions[currentQ].answer}.`}</p>
                    <button className="btn btn-primary" style={{ marginTop: '15px' }} onClick={handleNext}>
                      {currentQ < questions.length - 1 ? 'Next Question →' : 'Finish Quiz'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* RESULTS & DETAILED REVIEW TABLE */}
            {quizPhase === 'result' && (
              <div style={{ maxWidth: '760px' }}>
                <div className="result-hero">
                  <div>
                    <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '24px', fontWeight: '800' }}>Quiz Complete!</h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '5px' }}>Your progress has been saved securely to the cloud.</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="result-big">{Math.round((score / questions.length) * 100)}%</div>
                  </div>
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginTop: 0 }}>Question Review</div>
                  <table className="q-review-table">
                    <thead>
                      <tr><th>#</th><th>Question</th><th>Result</th><th>Confidence</th><th>Time</th></tr>
                    </thead>
                    <tbody>
                      {questionLog.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '700', color: '#64748B' }}>{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: '500', lineHeight: '1.5' }}>{item.question}</div>
                            {!item.isCorrect && (
                              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                <span style={{ color: '#DC2626' }}>You: {String(item.userAns).substring(0, 30)}...</span><br />
                                <span style={{ color: '#16A34A' }}>Correct: {item.correctAns}</span>
                              </div>
                            )}
                          </td>
                          <td>{item.isCorrect ? <span className="sbadge2 strong">Correct</span> : <span className="sbadge2 weak">Wrong</span>}</td>
                          <td>
                            {item.confidence === 'sure' ? <span style={{ color: '#16A34A', fontSize: '11px' }}>Sure</span> :
                              item.confidence === 'guess' ? <span style={{ color: '#D97706', fontSize: '11px' }}>Guessed</span> :
                                <span style={{ color: '#94A3B8', fontSize: '11px' }}>—</span>}
                          </td>
                          <td style={{ color: '#64748B', fontSize: '12px' }}>{item.timeTaken}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary" onClick={() => { setQuizPhase('setup'); setNotes(''); }}>+ New Quiz</button>
                  <button className="btn btn-secondary" onClick={() => setActiveTab('plan')}>View Study Plan</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- STUDY PLAN --- */}
        {activeTab === 'plan' && (
          <div className="page">
            {weakTopics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div><div className="empty-title">Study Schedule</div><div className="empty-desc">Take a quiz and answer incorrectly to trigger the AI study planner.</div>
              </div>
            ) : (
              <div className="plan-grid">
                <div>
                  <div className="section-title" style={{ fontSize: '15px', marginTop: 0 }}>Subjects</div>
                  <div className="card" style={{ padding: '15px' }}>
                    {Object.keys(subjectAgg).map((sub, i) => (
                      <div key={i} style={{ fontSize: '13px', fontWeight: '500', padding: '10px', borderBottom: '1px solid #E2E8F8' }}>{sub}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-title" style={{ fontSize: '15px', marginTop: 0 }}>This Week</div>
                  <div className="week-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <div key={i} className={`day-cell ${i === new Date().getDay() - 1 ? 'today' : ''}`}>
                        <div className="day-name">{day}</div>
                        <div className="day-num">{new Date().getDate() - (new Date().getDay() - 1) + i}</div>
                      </div>
                    ))}
                  </div>
                  <div className="section-title" style={{ fontSize: '14px', marginBottom: '12px' }}>Today's Priority List</div>
                  {weakTopics.map((wt, i) => (
                    <div key={i} className="topic-row">
                      <div className="topic-info">
                        <div className="topic-name">Revise: {wt.sub} - {wt.name}</div>
                        <div className="topic-meta">{wt.pct}% accuracy · Weak Area ⚠️</div>
                      </div>
                      <div className="topic-time">45 min</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- ANALYTICS --- */}
        {activeTab === 'analytics' && (
          <div className="page">
            {stats.quizzesTaken === 0 ? (
              <div className="empty-state"><div className="empty-icon">📊</div><div className="empty-title">No analytics data yet</div><div className="empty-desc">Complete at least one practice quiz to generate your performance breakdown.</div></div>
            ) : (
              <div>
                <div className="analytics-hero"><div><h2>Performance Analytics</h2><p>AI-powered weak vs strong topic breakdown</p></div><div className="hero-score"><div className="big">{stats.avgScore}%</div><div className="sub">Overall Readiness</div></div></div>
                <div className="analytics-2col">
                  <div className="card">
                    <div className="card-title">Topic Strength Distribution</div>
                    <div className="donut-wrap">
                      <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#E2E8F8" strokeWidth="16" />
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#16A34A" strokeWidth="16" strokeDasharray={`${sDash} ${circ - sDash}`} strokeDashoffset="0" transform="rotate(-90 60 60)" />
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#D97706" strokeWidth="16" strokeDasharray={`${aDash} ${circ - aDash}`} strokeDashoffset={-sDash} transform="rotate(-90 60 60)" />
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#DC2626" strokeWidth="16" strokeDasharray={`${wDash} ${circ - wDash}`} strokeDashoffset={-(sDash + aDash)} transform="rotate(-90 60 60)" />
                        <text x="60" y="55" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="17" fontWeight="800" fill="#0F172A">{topicEntries.length}</text>
                      </svg>
                      <div className="donut-legend">
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#16A34A' }}></div><span className="legend-label">Strong</span><span className="legend-val">{strongTopics.length}</span></div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#D97706' }}></div><span className="legend-label">Average</span><span className="legend-val">{avgTopics.length}</span></div>
                        <div className="legend-item"><div className="legend-dot" style={{ background: '#DC2626' }}></div><span className="legend-label">Weak</span><span className="legend-val">{weakTopics.length}</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-title">Topic-wise Accuracy Breakdown</div>
                    <table className="topic-table">
                      <thead><tr><th>Topic</th><th>Accuracy</th><th>Status</th></tr></thead>
                      <tbody>
                        {topicEntries.map(([key, data], idx) => {
                          const pct = Math.round((data.correct / data.total) * 100);
                          const color = pct >= 75 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: '500' }}>
                                <div style={{ fontSize: '14px', color: '#0F172A' }}>{key.split(':')[0]}</div>
                                <div style={{ fontSize: '12px', color: '#64748B' }}>
                                  {key.split(':')[1] === 'General' ? 'Mixed Concepts' : key.split(':')[1]}
                                </div>
                              </td>                              <td><div className="acc-wrap"><div className="acc-bar"><div className="acc-fill" style={{ width: `${pct}%`, background: color }}></div></div><div className="acc-num" style={{ color: color }}>{pct}%</div></div></td>
                              <td>{pct >= 75 && <span className="sbadge2 strong">★ Strong</span>}{pct >= 50 && pct < 75 && <span className="sbadge2 avg">~ Average</span>}{pct < 50 && <span className="sbadge2 weak">✗ Weak</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;