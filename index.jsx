import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';

// --- Firebase Configuration & Initialization ---
// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-task-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Context for Firebase and User State ---
const FirebaseContext = createContext(null);

/**
 * Provides Firebase (Firestore, Auth) instances and user state to child components.
 */
const FirebaseProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isFirebaseReady, setIsFirebaseReady] = useState(false);

    useEffect(() => {
        const setupFirebase = async () => {
            try {
                // Sign in with custom token if available, otherwise anonymously
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }

                // Listen for auth state changes
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    if (user) {
                        setCurrentUser(user);
                        setUserId(user.uid);
                    } else {
                        setCurrentUser(null);
                        setUserId(null);
                    }
                    setIsFirebaseReady(true); // Firebase is ready after initial auth check
                });

                return () => unsubscribe(); // Cleanup auth listener
            } catch (error) {
                console.error("Firebase authentication error:", error);
                setIsFirebaseReady(true); // Still mark as ready even if auth fails
            }
        };

        setupFirebase();
    }, []); // Run once on component mount

    return (
        <FirebaseContext.Provider value={{ db, auth, currentUser, userId, isFirebaseReady }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// --- Custom Message Box Component ---
const Message = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [currentMessage, setCurrentMessage] = useState('');
    const [messageType, setMessageType] = useState('info');
    const timeoutRef = useRef(null);

    useEffect(() => {
        // Expose a global function to show messages
        window.showMessage = (msg, msgType = 'info') => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            setCurrentMessage(msg);
            setMessageType(msgType);
            setIsVisible(true);
            timeoutRef.current = setTimeout(() => {
                setIsVisible(false);
            }, 3000); // Hide after 3 seconds
        };

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            delete window.showMessage; // Clean up global function
        };
    }, []);

    const bgColorClass = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600',
    }[messageType];

    return (
        <div
            id="message-box"
            className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 text-white px-6 py-3 rounded-md shadow-lg z-50 transition-opacity duration-300 ${bgColorClass} ${isVisible ? 'opacity-100' : 'opacity-0 hidden'}`}
        >
            <span id="message-text">{currentMessage}</span>
        </div>
    );
};

// --- Header Component ---
const Header = ({ onNavigate, currentUser, onLogout }) => {
    return (
        <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md py-4 px-6 flex items-center justify-between sticky top-0 z-10 rounded-b-lg">
            <div className="flex items-center space-x-3">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
                <h1 className="text-2xl font-bold">TaskFlow Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
                {currentUser && currentUser.email ? (
                    <>
                        <span className="text-sm font-medium hidden md:block">Welcome, {currentUser.email.split('@')[0]}!</span>
                        <button
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md transition-colors duration-200 shadow-sm"
                            onClick={onLogout}
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <button
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors duration-200 shadow-sm"
                        onClick={() => onNavigate('login')}
                    >
                        Login / Register
                    </button>
                )}
            </div>
        </header>
    );
};

// --- Task Form Component ---
const TaskForm = ({ onAddTask, editingTask, onUpdateTask, onCancelEdit }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState('Medium');

    useEffect(() => {
        if (editingTask) {
            setTitle(editingTask.title);
            setDescription(editingTask.description);
            setDueDate(editingTask.dueDate || '');
            setPriority(editingTask.priority || 'Medium');
        } else {
            setTitle('');
            setDescription('');
            setDueDate('');
            setPriority('Medium');
        }
    }, [editingTask]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) {
            window.showMessage('Task title cannot be empty.', 'error');
            return;
        }

        const taskData = {
            title: title.trim(),
            description: description.trim(),
            dueDate: dueDate,
            priority: priority,
            completed: editingTask ? editingTask.completed : false, // Preserve status on edit
        };

        if (editingTask) {
            onUpdateTask(editingTask.id, taskData);
        } else {
            onAddTask(taskData);
        }
        // Reset form
        setTitle('');
        setDescription('');
        setDueDate('');
        setPriority('Medium');
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{editingTask ? 'Edit Task' : 'Add New Task'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="title" className="block text-gray-700 text-sm font-bold mb-2">Title:</label>
                    <input type="text" id="title" className="shadow appearance-none border rounded-md w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div>
                    <label htmlFor="description" className="block text-gray-700 text-sm font-bold mb-2">Description (Optional):</label>
                    <textarea id="description" rows="3" className="shadow appearance-none border rounded-md w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="dueDate" className="block text-gray-700 text-sm font-bold mb-2">Due Date (Optional):</label>
                        <input type="date" id="dueDate" className="shadow appearance-none border rounded-md w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="priority" className="block text-gray-700 text-sm font-bold mb-2">Priority:</label>
                        <select id="priority" className="shadow appearance-none border rounded-md w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={priority} onChange={(e) => setPriority(e.target.value)}>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                </div>
                <div className="flex space-x-4">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-md transition-colors duration-200 shadow-md">
                        {editingTask ? 'Update Task' : 'Add Task'}
                    </button>
                    {editingTask && (
                        <button type="button" className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md transition-colors duration-200 shadow-md" onClick={onCancelEdit}>
                            Cancel
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

// --- Task Item Component ---
const TaskItem = ({ task, onToggleComplete, onEditTask, onDeleteTask }) => {
    const priorityColors = {
        High: 'bg-red-100 text-red-800',
        Medium: 'bg-yellow-100 text-yellow-800',
        Low: 'bg-green-100 text-green-800',
    };

    return (
        <div className={`bg-white p-5 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between transition-all duration-200 ${task.completed ? 'opacity-70 border-l-4 border-green-500' : 'border-l-4 border-blue-500'}`}>
            <div className="flex-grow mb-3 md:mb-0">
                <h3 className={`text-lg font-semibold ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>{task.title}</h3>
                {task.description && <p className="text-gray-600 text-sm mt-1 line-clamp-2">{task.description}</p>}
                <div className="flex items-center text-xs text-gray-500 mt-2 space-x-3">
                    {task.dueDate && <span>📅 Due: {task.dueDate}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[task.priority] || 'bg-gray-100 text-gray-800'}`}>{task.priority} Priority</span>
                </div>
            </div>
            <div className="flex space-x-2 flex-shrink-0">
                <button
                    className={`px-3 py-1 rounded-md text-sm font-medium ${task.completed ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors duration-200`}
                    onClick={() => onToggleComplete(task.id, !task.completed)}
                >
                    {task.completed ? 'Unmark' : 'Complete'}
                </button>
                <button
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                    onClick={() => onEditTask(task)}
                >
                    Edit
                </button>
                <button
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                    onClick={() => onDeleteTask(task.id)}
                >
                    Delete
                </button>
            </div>
        </div>
    );
};

// --- Filter Bar Component ---
const FilterBar = ({ filterStatus, onFilterChange }) => {
    const filterOptions = ['All', 'Active', 'Completed'];

    return (
        <div className="bg-white p-4 rounded-lg shadow-md mb-8 flex justify-center space-x-4">
            {filterOptions.map(option => (
                <button
                    key={option}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${filterStatus === option ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    onClick={() => onFilterChange(option)}
                >
                    {option}
                </button>
            ))}
        </div>
    );
};

// --- Dashboard Page Component ---
const DashboardPage = ({ onNavigate }) => {
    const { db, currentUser, userId, isFirebaseReady } = useContext(FirebaseContext);
    const [tasks, setTasks] = useState([]);
    const [filterStatus, setFilterStatus] = useState('All');
    const [editingTask, setEditingTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch tasks from Firestore
    useEffect(() => {
        if (!isFirebaseReady || !userId) {
            setTasks([]); // Clear tasks if not logged in or Firebase not ready
            setIsLoading(false);
            return;
        }

        const tasksCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/tasks`);
        const q = query(tasksCollectionRef, orderBy('timestamp', 'desc')); // Order by most recent

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTasks(fetchedTasks);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching tasks:", error);
            window.showMessage('Failed to load tasks.', 'error');
            setIsLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener
    }, [db, userId, isFirebaseReady]);

    const handleAddTask = async (taskData) => {
        if (!userId) {
            window.showMessage('Please log in to add tasks.', 'info');
            onNavigate('login');
            return;
        }
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/tasks`), {
                ...taskData,
                timestamp: serverTimestamp(),
            });
            window.showMessage('Task added successfully!', 'success');
        } catch (e) {
            console.error("Error adding document: ", e);
            window.showMessage('Failed to add task.', 'error');
        }
    };

    const handleUpdateTask = async (id, updatedData) => {
        if (!userId) {
            window.showMessage('Please log in to update tasks.', 'info');
            onNavigate('login');
            return;
        }
        try {
            const taskDocRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, id);
            await updateDoc(taskDocRef, updatedData);
            window.showMessage('Task updated successfully!', 'success');
            setEditingTask(null); // Exit editing mode
        } catch (e) {
            console.error("Error updating document: ", e);
            window.showMessage('Failed to update task.', 'error');
        }
    };

    const handleToggleComplete = async (id, completedStatus) => {
        if (!userId) {
            window.showMessage('Please log in to update tasks.', 'info');
            onNavigate('login');
            return;
        }
        try {
            const taskDocRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, id);
            await updateDoc(taskDocRef, { completed: completedStatus });
            window.showMessage(`Task marked as ${completedStatus ? 'completed' : 'active'}!`, 'success');
        } catch (e) {
            console.error("Error updating task status: ", e);
            window.showMessage('Failed to update task status.', 'error');
        }
    };

    const handleDeleteTask = async (id) => {
        if (!userId) {
            window.showMessage('Please log in to delete tasks.', 'info');
            onNavigate('login');
            return;
        }
        if (window.confirm('Are you sure you want to delete this task?')) { // Using window.confirm for simplicity, custom modal for production
            try {
                const taskDocRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, id);
                await deleteDoc(taskDocRef);
                window.showMessage('Task deleted successfully!', 'success');
            } catch (e) {
                console.error("Error deleting document: ", e);
                window.showMessage('Failed to delete task.', 'error');
            }
        }
    };

    const handleEditTask = (task) => {
        setEditingTask(task);
    };

    const handleCancelEdit = () => {
        setEditingTask(null);
    };

    const filteredTasks = tasks.filter(task => {
        if (filterStatus === 'All') return true;
        if (filterStatus === 'Active') return !task.completed;
        if (filterStatus === 'Completed') return task.completed;
        return true;
    });

    if (!currentUser) {
        return (
            <div className="text-center text-gray-600 text-lg mt-20 p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
                Please <span className="text-blue-600 cursor-pointer" onClick={() => onNavigate('login')}>log in</span> to manage your tasks.
            </div>
        );
    }

    if (isLoading) {
        return <div className="text-center text-gray-400 text-xl mt-20">Loading tasks...</div>;
    }

    return (
        <div className="p-6">
            <TaskForm
                onAddTask={handleAddTask}
                editingTask={editingTask}
                onUpdateTask={handleUpdateTask}
                onCancelEdit={handleCancelEdit}
            />
            <FilterBar filterStatus={filterStatus} onFilterChange={setFilterStatus} />
            <div className="space-y-4">
                {filteredTasks.length > 0 ? (
                    filteredTasks.map(task => (
                        <TaskItem
                            key={task.id}
                            task={task}
                            onToggleComplete={handleToggleComplete}
                            onEditTask={handleEditTask}
                            onDeleteTask={handleDeleteTask}
                        />
                    ))
                ) : (
                    <p className="text-center text-gray-600 text-lg mt-10 p-6 bg-white rounded-lg shadow-md">
                        {filterStatus === 'All' && 'No tasks found. Add a new task above!'}
                        {filterStatus === 'Active' && 'No active tasks. Time to relax!'}
                        {filterStatus === 'Completed' && 'No completed tasks yet. Get to work!'}
                    </p>
                )}
            </div>
        </div>
    );
};

// --- Login Page Component ---
const LoginPage = ({ onNavigate }) => {
    const { auth, db, currentUser, userId, isFirebaseReady } = useContext(FirebaseContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoginMode, setIsLoginMode] = useState(true); // true for Login, false for Register

    const handleAuth = async (e) => {
        e.preventDefault();
        if (!isFirebaseReady) {
            window.showMessage('Firebase not ready. Please wait.', 'info');
            return;
        }

        try {
            // For this demo, we'll simulate user accounts using Firestore.
            // In a real app, you'd use Firebase Authentication methods like signInWithEmailAndPassword / createUserWithEmailAndPassword.
            const userDocRef = doc(db, `artifacts/${appId}/users`, email.toLowerCase()); // Use email as doc ID for simplicity
            const userDoc = await getDoc(userDocRef);

            if (isLoginMode) {
                // Simulate Login
                if (userDoc.exists() && userDoc.data().password === password) {
                    // Attach email to current anonymous user for display purposes
                    if (auth.currentUser) {
                        auth.currentUser.email = email;
                    }
                    window.showMessage(`Logged in as ${email}!`, 'success');
                    onNavigate('dashboard');
                } else {
                    window.showMessage('Invalid email or password.', 'error');
                }
            } else {
                // Simulate Registration
                if (userDoc.exists()) {
                    window.showMessage('User with this email already exists.', 'error');
                } else {
                    await setDoc(userDocRef, {
                        email: email.toLowerCase(),
                        password: password, // WARNING: Storing passwords directly is NOT secure in a real app!
                        createdAt: serverTimestamp(),
                    });
                    window.showMessage('Registration successful! Please log in.', 'success');
                    setIsLoginMode(true); // Switch to login mode
                }
            }
        } catch (error) {
            console.error("Auth simulation error:", error);
            window.showMessage('An error occurred during authentication.', 'error');
        }
    };

    const handleLogout = async () => {
        try {
            await auth.signOut(); // Sign out the anonymous user
            window.showMessage('Logged out successfully!', 'info');
            onNavigate('dashboard'); // Redirect to dashboard, which will prompt login
        } catch (error) {
            console.error("Logout error:", error);
            window.showMessage('Failed to log out.', 'error');
        }
    };

    if (!isFirebaseReady) {
        return <div className="text-center text-gray-400 text-xl mt-10">Loading authentication...</div>;
    }

    return (
        <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md mt-10">
            {currentUser && currentUser.email ? (
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4 text-gray-900">Welcome, {currentUser.email.split('@')[0]}!</h2>
                    <p className="text-gray-700 mb-6">You are currently logged in.</p>
                    <button
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline transition-colors duration-200"
                        onClick={handleLogout}
                    >
                        Logout
                    </button>
                </div>
            ) : (
                <>
                    <h2 className="text-2xl font-bold mb-6 text-gray-900 text-center">{isLoginMode ? 'Login' : 'Register'}</h2>
                    <form onSubmit={handleAuth} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">Email:</label>
                            <input type="email" id="email" className="shadow appearance-none border rounded-md w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">Password:</label>
                            <input type="password" id="password" className="shadow appearance-none border rounded-md w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline transition-colors duration-200 w-full">
                            {isLoginMode ? 'Login' : 'Register'}
                        </button>
                    </form>
                    <p className="mt-6 text-center text-gray-700">
                        {isLoginMode ? "Don't have an account?" : "Already have an account?"}{' '}
                        <button className="text-blue-600 hover:underline font-semibold" onClick={() => setIsLoginMode(!isLoginMode)}>
                            {isLoginMode ? 'Register here' : 'Login here'}
                        </button>
                    </p>
                    <p className="mt-4 text-center text-gray-500 text-sm">
                        (Note: This is a simulated login for demo purposes. Passwords are not securely stored or authenticated.)
                    </p>
                </>
            )}
        </div>
    );
};


// --- Main App Component ---
const App = () => {
    const [currentPage, setCurrentPage] = useState('dashboard'); // Default to dashboard
    const { currentUser, auth } = useContext(FirebaseContext);

    const handleNavigate = (page) => {
        setCurrentPage(page);
        window.scrollTo(0, 0); // Scroll to top
    };

    const handleLogout = async () => {
        try {
            await auth.signOut(); // Sign out the anonymous user
            window.showMessage('Logged out successfully!', 'info');
            handleNavigate('dashboard'); // Redirect to dashboard, which will prompt login
        } catch (error) {
            console.error("Logout error:", error);
            window.showMessage('Failed to log out.', 'error');
        }
    };


    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            <Header onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />
            <main className="flex-grow container mx-auto p-4">
                {(() => {
                    switch (currentPage) {
                        case 'dashboard':
                            return <DashboardPage onNavigate={handleNavigate} />;
                        case 'login':
                            return <LoginPage onNavigate={handleNavigate} />;
                        default:
                            return <DashboardPage onNavigate={handleNavigate} />;
                    }
                })()}
            </main>
            <Message />
        </div>
    );
};

export default App;
