import { Component, signal, computed, effect, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// --- Task Interface ---
interface Task {
  id: string;
  title: string;
  category: 'Personal' | 'Work' | 'Study' | 'Health';
  priority: 'High' | 'Medium' | 'Low';
  completed: boolean;
  createdAt: any;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html', 
  styleUrls: ['./app.css']
})
export class App implements OnDestroy { 
  
  // --- STATE SIGNALS ---
  loading = signal(true);
  currentUser = signal<User | null>(null);
  isSignUp = signal(false);
  authError = signal('');
  tasks = signal<Task[]>([]);
  activeFilter = signal<'All' | 'Pending' | 'Completed'>('All');
  today = new Date();
  
  // --- INPUTS ---
  email = '';
  password = '';
  newTaskTitle = signal('');
  newTaskCategory = signal<'Personal' | 'Work' | 'Study' | 'Health'>('Personal');
  newTaskPriority = signal<'High' | 'Medium' | 'Low'>('Medium');
  
  filters = ['All', 'Pending', 'Completed'] as const;

  // Firebase variables
  private app: any;
  private auth: any;
  private db: any;
  private unsubscribeAuth: any;
  private unsubscribeTasks: any;
  
  // We check if we are in the browser
  isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.initFirebase();
  }

  async initFirebase() {
    // CRITICAL FIX: Only run this if we are in the Browser!
    if (this.isBrowser) {
      try {
        // 1. Get Config (Safely)
        const firebaseConfig = (window as any).__firebase_config 
          ? JSON.parse((window as any).__firebase_config) 
          : {
            // REPLACE THESE WITH YOUR KEYS IF YOU HAVE THEM
            apiKey: "AIzaSyD9qI0W_kFtuOQG2Hv2rrS8TZ04BfYp7Is",
            authDomain: "focus-manager-f57be.firebaseapp.com",
            projectId: "focus-manager-f57be",
            storageBucket: "focus-manager-f57be.firebasestorage.app",
            messagingSenderId: "231866978432",
            appId: "1:231866978432:web:a77a2cb49ac1ad70925665",
            measurementId: "G-B5D11G7XST"
          };

        // 2. Initialize
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);

        // 3. Listen for User
        this.unsubscribeAuth = onAuthStateChanged(this.auth, (user) => {
          this.currentUser.set(user);
          this.loading.set(false);
          if (user) {
            this.subscribeToTasks(user.uid);
          } else {
            this.tasks.set([]);
          }
        });
      } catch (e) {
        console.error("Firebase Init Error:", e);
        this.loading.set(false);
      }
    } else {
      // If on server, stop loading so page renders
      this.loading.set(false);
    }
  }

  // --- AUTH METHODS ---
  toggleAuthMode() {
    this.isSignUp.update(v => !v);
    this.authError.set('');
  }

  async handleAuth() {
    if (!this.email || !this.password) return;
    this.authError.set('');
    try {
      if (this.isSignUp()) {
        await createUserWithEmailAndPassword(this.auth, this.email, this.password);
      } else {
        await signInWithEmailAndPassword(this.auth, this.email, this.password);
      }
    } catch (e: any) {
      this.authError.set(e.message);
    }
  }

  logout() { signOut(this.auth); }

  // --- DATABASE METHODS ---
  subscribeToTasks(userId: string) {
    if (!this.db) return; // Safety check
    const q = query(collection(this.db, 'users', userId, 'tasks'));
    this.unsubscribeTasks = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
      tasksData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      this.tasks.set(tasksData);
    });
  }

  async addTask() {
    if (!this.newTaskTitle().trim() || !this.currentUser() || !this.db) return;
    await addDoc(collection(this.db, 'users', this.currentUser()!.uid, 'tasks'), {
      title: this.newTaskTitle(),
      category: this.newTaskCategory(),
      priority: this.newTaskPriority(),
      completed: false,
      createdAt: serverTimestamp()
    });
    this.newTaskTitle.set('');
  }

  async toggleTask(task: Task) {
    if (!this.db) return;
    await updateDoc(doc(this.db, 'users', this.currentUser()!.uid, 'tasks', task.id), {
      completed: !task.completed
    });
  }

  async deleteTask(id: string) {
    if (!this.db) return;
    if(confirm('Are you sure you want to delete this task?')) {
      await deleteDoc(doc(this.db, 'users', this.currentUser()!.uid, 'tasks', id));
    }
  }

  // --- VIEW HELPERS ---
  filteredTasks = computed(() => {
    const current = this.tasks();
    const filter = this.activeFilter();
    if (filter === 'Pending') return current.filter(t => !t.completed);
    if (filter === 'Completed') return current.filter(t => t.completed);
    return current;
  });

  getCount(filter: string) {
    const current = this.tasks();
    if (filter === 'Pending') return current.filter(t => !t.completed).length;
    if (filter === 'Completed') return current.filter(t => t.completed).length;
    return current.length;
  }

  ngOnDestroy() {
    if (this.unsubscribeAuth) this.unsubscribeAuth();
    if (this.unsubscribeTasks) this.unsubscribeTasks();
  }
}