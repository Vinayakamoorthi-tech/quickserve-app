import React, { useState, useEffect } from 'react';
import { 
  Search, Trash2, Printer, Plus, Minus, ShoppingBag,
  UtensilsCrossed, History, X, Save, Clock, CheckCircle,
  Settings, Edit, List, Moon, Sun
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, orderBy, setDoc 
} from "firebase/firestore";

// --- YOUR FREE TIER CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyC9XHBNOftotgL4bZLkCSFjK_MTKQXO0xs",
  authDomain: "quickserve-d486a.firebaseapp.com",
  projectId: "quickserve-d486a",
  storageBucket: "quickserve-d486a.firebasestorage.app",
  messagingSenderId: "1045900551202",
  appId: "1:1045900551202:web:ce45df2e26036b2b82967b",
  measurementId: "G-90JBCQ8452"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CONSTANTS ---
const DEFAULT_CATEGORIES = [
  { id: 'starters', name: 'Starters' },
  { id: 'gravy', name: 'Gravy' },
  { id: 'main', name: 'Main Course' },
  { id: 'breads', name: 'Breads' },
];

export default function App() {
  // --- STATE ---
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mobileTab, setMobileTab] = useState('menu');

  // Data State (Synced with Firebase)
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [activeOrders, setActiveOrders] = useState([]); 
  const [salesHistory, setSalesHistory] = useState([]);
  const [tokenNumber, setTokenNumber] = useState(101); // Global Token

  // Local Form State
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('main');

  // POS State
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // --- FIREBASE LISTENERS (The "Sync" Magic) ---
  useEffect(() => {
    // 1. Theme Listener (Local Preference)
    const savedTheme = localStorage.getItem('qs_theme');
    if (savedTheme === 'dark') setIsDarkMode(true);

    // 2. Menu Listener (Real-time)
    const unsubscribeMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMenuItems(items);
    });

    // 3. Active Orders Listener (Real-time)
    const qOrders = query(collection(db, "active_orders"), orderBy("timestamp", "desc"));
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveOrders(orders);
    });

    // 4. Sales History Listener (Real-time)
    const qHistory = query(collection(db, "sales_history"), orderBy("timestamp", "desc"));
    const unsubscribeHistory = onSnapshot(qHistory, (snapshot) => {
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSalesHistory(history);
    });

    // 5. Token Listener (Global Counter)
    const unsubscribeToken = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
      if (docSnap.exists()) {
        setTokenNumber(docSnap.data().token);
      } else {
        // Initialize if missing
        setDoc(doc(db, "settings", "global"), { token: 101 });
      }
    });

    return () => {
      unsubscribeMenu();
      unsubscribeOrders();
      unsubscribeHistory();
      unsubscribeToken();
    };
  }, []);

  // --- FUNCTIONS ---

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('qs_theme', newMode ? 'dark' : 'light');
  };

  const startNewOrder = () => {
    setCurrentOrderId(null); // Null means "New Draft"
    setCart([]);
    setCustomerName('');
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(i => i.qty > 0));
  };

  // --- FIREBASE WRITE OPERATIONS ---

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;
    const itemData = {
      name: newItemName,
      price: parseFloat(newItemPrice),
      category: newItemCategory
    };
    
    if (editingItem) {
      await updateDoc(doc(db, "menu", editingItem.id), itemData);
    } else {
      await addDoc(collection(db, "menu"), itemData);
    }
    setEditingItem(null); setNewItemName(''); setNewItemPrice('');
  };

  const handleDeleteItem = async (id) => {
    if(confirm("Delete this item?")) {
      await deleteDoc(doc(db, "menu", id));
    }
  };

  const handleEditClick = (item) => {
    setEditingItem(item); setNewItemName(item.name); setNewItemPrice(item.price); setNewItemCategory(item.category);
  };

  const saveCurrentOrder = async (shouldCreateNew = true) => {
    if (cart.length === 0 && !customerName) return; 

    // Use existing token if editing, or Global Token if new
    const activeToken = currentOrderId ? (activeOrders.find(o=>o.id === currentOrderId)?.token || tokenNumber) : tokenNumber;

    const orderData = {
      token: activeToken,
      customer: customerName,
      items: cart,
      total: cart.reduce((sum, i) => sum + (i.price * i.qty), 0),
      timestamp: new Date().toISOString(),
      status: 'held'
    };

    if (currentOrderId) {
      // Update existing held order
      await setDoc(doc(db, "active_orders", currentOrderId), orderData);
    } else {
      // Create NEW held order
      await addDoc(collection(db, "active_orders"), orderData);
      // Increment Global Token only for NEW orders
      await updateDoc(doc(db, "settings", "global"), { token: tokenNumber + 1 });
    }

    if (shouldCreateNew) startNewOrder();
  };

  const switchOrder = (orderId) => {
    const targetOrder = activeOrders.find(o => o.id === orderId);
    if (targetOrder) {
      setCurrentOrderId(targetOrder.id); 
      setCart(targetOrder.items); 
      setCustomerName(targetOrder.customer);
      setMobileTab('cart');
    }
  };

  const createNewTab = () => {
    if (cart.length > 0) saveCurrentOrder(false); // Save current draft before switching
    startNewOrder();
    setMobileTab('menu');
  };

  const deleteActiveOrder = async (e, id) => {
    e.stopPropagation();
    if(confirm("Delete this held order?")) {
      await deleteDoc(doc(db, "active_orders", id));
      if (currentOrderId === id) startNewOrder();
    }
  };

  const confirmPrintAndClose = async () => {
    window.print();

    const activeToken = currentOrderId ? (activeOrders.find(o=>o.id === currentOrderId)?.token || tokenNumber) : tokenNumber;

    const finalOrder = {
      token: activeToken,
      customer: customerName || 'Guest', 
      items: cart,
      total: cart.reduce((sum, i) => sum + (i.price * i.qty), 0),
      timestamp: new Date().toISOString(),
    };

    // 1. Save to Sales History
    await addDoc(collection(db, "sales_history"), finalOrder);

    // 2. Cleanup Active Order or Increment Token
    if (currentOrderId) {
      await deleteDoc(doc(db, "active_orders", currentOrderId));
    } else {
      // Direct checkout means we used a token, so increment the global counter
      await updateDoc(doc(db, "settings", "global"), { token: tokenNumber + 1 });
    }
    
    startNewOrder();
    setShowReceipt(false);
  };

  const handleEndDay = async () => {
    if(confirm("⚠️ End Day? This will DELETE all history and RESET token.")) {
       // Note: Client-side batch deletion for small shops
       salesHistory.forEach(async (order) => {
         await deleteDoc(doc(db, "sales_history", order.id));
       });
       activeOrders.forEach(async (order) => {
          await deleteDoc(doc(db, "active_orders", order.id));
       });
       // Reset Token to 101
       await setDoc(doc(db, "settings", "global"), { token: 101 });
       
       startNewOrder();
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // --- RENDER ---
  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="flex flex-col md:flex-row h-screen w-full bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
        
        {/* 1. MENU SECTION */}
        <div className={`flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200 dark:border-slate-700 ${mobileTab === 'menu' ? 'flex' : 'hidden md:flex'}`}>
          <div className="bg-white dark:bg-slate-800 p-4 shadow-sm z-10 transition-colors">
             <div className="flex justify-between items-center mb-4">
              {/* LOGO & NAME HEADER */}
              <h1 className="text-xl font-bold flex items-center gap-2">
                {/* 1. Your Logo Image */}
                <img src="/logo.png" alt="Shop Logo" className="h-8 w-8 object-contain" />
                
                {/* 2. Your Shop Name */}
                <span>Murugan Kadai</span> 
                
                {/* 3. Cloud Badge (Keep this) */}
                <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200">Cloud</span>
              </h1>
              <div className="flex gap-2">
                 <button onClick={toggleTheme} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                 </button>
                 <button onClick={() => setShowMenuManager(true)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors" title="Menu"><Settings size={20}/></button>
                 <button onClick={() => setShowHistory(true)} className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors" title="History"><History size={20}/></button>
              </div>
             </div>
             <div className="relative mb-2">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                <input type="text" placeholder="Search items..." className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition-colors" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
             </div>
             <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
               <button onClick={()=>setSelectedCategory('all')} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedCategory==='all'?'bg-orange-500 text-white':'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>All</button>
               {categories.map(c => (
                 <button key={c.id} onClick={()=>setSelectedCategory(c.id)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedCategory===c.id?'bg-orange-500 text-white':'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{c.name}</button>
               ))}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900/50 pb-20 md:pb-4 transition-colors">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {menuItems.filter(i => (selectedCategory==='all' || i.category===selectedCategory) && i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                <button key={item.id} onClick={() => addToCart(item)} className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm hover:shadow-md text-left border border-transparent hover:border-orange-300 dark:hover:border-orange-500 relative group transition-all">
                  <div className="font-bold text-slate-700 dark:text-slate-200 text-sm leading-tight pr-4">{item.name}</div>
                  <div className="text-slate-500 dark:text-slate-400 text-xs mt-1 font-mono">₹{item.price}</div>
                  <div className="absolute bottom-2 right-2 bg-orange-500 text-white p-1 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><Plus size={14}/></div>
                </button>
              ))}
              {menuItems.length === 0 && <div className="col-span-full text-center text-gray-400 dark:text-gray-500 py-10">Menu is empty. Click Settings to add items.</div>}
            </div>
          </div>
        </div>

        {/* 2. CART SECTION */}
        <div className={`w-full md:w-80 bg-white dark:bg-slate-800 shadow-xl flex flex-col h-full z-20 border-r border-slate-200 dark:border-slate-700 transition-colors ${mobileTab === 'cart' ? 'flex' : 'hidden md:flex'}`}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
            <div className="flex-1">
               <label className="text-[10px] font-bold text-slate-400 uppercase">Customer</label>
               <input type="text" placeholder="Name / Desc" className="w-full bg-transparent font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:font-normal placeholder:text-slate-400 text-sm" value={customerName} onChange={e=>setCustomerName(e.target.value)} />
            </div>
            <div className="text-right pl-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Token</div>
              <div className="font-bold text-xl">#{currentOrderId ? (activeOrders.find(o=>o.id===currentOrderId)?.token) : tokenNumber}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600"><ShoppingBag size={32}/><span className="text-xs mt-2">Empty Cart</span></div> : 
              cart.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 p-2 rounded shadow-sm">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-slate-700 dark:text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-400">₹{item.price} x {item.qty}</div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1">
                    <button onClick={()=>updateQty(item.id, -1)} className="text-slate-600 dark:text-slate-400 hover:text-orange-500"><Minus size={12}/></button>
                    <span className="text-xs font-bold w-3 text-center dark:text-slate-200">{item.qty}</span>
                    <button onClick={()=>updateQty(item.id, 1)} className="text-slate-600 dark:text-slate-400 hover:text-orange-500"><Plus size={12}/></button>
                  </div>
                </div>
              ))
            }
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 mb-16 md:mb-0">
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-500 dark:text-slate-400 text-sm">Total</span>
              <span className="text-xl font-bold">₹{cartTotal.toFixed(0)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => saveCurrentOrder(true)} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold py-3 rounded-lg flex items-center justify-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm transition-colors">
                <Save size={16}/> Save
              </button>
              <button onClick={() => cart.length > 0 && setShowReceipt(true)} disabled={cart.length===0} className="bg-green-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-1 hover:bg-green-500 disabled:opacity-50 text-sm">
                <CheckCircle size={16}/> Finish
              </button>
            </div>
          </div>
        </div>

        {/* 3. ACTIVE ORDERS */}
        <div className={`w-full md:w-48 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 flex flex-col h-full transition-colors ${mobileTab === 'orders' ? 'flex' : 'hidden md:flex'}`}>
          <div className="p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-[10px] text-slate-500 uppercase tracking-wider flex justify-between items-center">
            <span>Active Tabs</span>
            <button onClick={createNewTab} className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-1 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50"><Plus size={14}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 mb-16 md:mb-0">
            {!currentOrderId && (
               <div className="bg-white dark:bg-slate-800 border-2 border-orange-500 p-3 rounded-lg shadow-sm cursor-default relative">
                 <div className="font-bold text-orange-600 text-sm">#{tokenNumber} (New)</div>
                 <div className="text-xs text-slate-400 mt-1 truncate">{customerName || 'No Name'}</div>
               </div>
            )}
            {activeOrders.map(order => (
              <div key={order.id} onClick={() => switchOrder(order.id)} className={`p-3 rounded-lg cursor-pointer transition-all relative group ${currentOrderId === order.id ? 'bg-white dark:bg-slate-800 border-2 border-blue-500 shadow-md' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}>
                <div className="flex justify-between items-start">
                  <div className={`font-bold text-sm ${currentOrderId === order.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>#{order.token}</div>
                  <button onClick={(e) => deleteActiveOrder(e, order.id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{order.customer || 'Guest'}</div>
                <div className="flex justify-between items-end mt-2">
                   <span className="text-xs font-bold bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-1.5 rounded">₹{order.total}</span>
                   <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock size={10}/> {new Date(order.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --- MOBILE BOTTOM NAV --- */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-around items-center p-3 z-40 transition-colors">
          <button onClick={() => setMobileTab('menu')} className={`flex flex-col items-center text-xs font-bold ${mobileTab === 'menu' ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>
            <UtensilsCrossed size={20} />
            <span>Menu</span>
          </button>
          <button onClick={() => setMobileTab('cart')} className={`flex flex-col items-center text-xs font-bold relative ${mobileTab === 'cart' ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>
            <div className="relative">
              <ShoppingBag size={20} />
              {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full">{cartCount}</span>}
            </div>
            <span>Cart</span>
          </button>
          <button onClick={() => setMobileTab('orders')} className={`flex flex-col items-center text-xs font-bold ${mobileTab === 'orders' ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>
            <List size={20} />
            <span>Orders</span>
          </button>
        </div>

        {/* --- MODALS --- */}
        
        {/* 1. MENU MANAGER */}
        {showMenuManager && (
          <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800 rounded-t-lg">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Menu Manager (Cloud)</h2>
                <button onClick={() => setShowMenuManager(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white"><X size={24}/></button>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSaveItem} className="flex flex-col md:flex-row gap-2">
                  <input className="p-2 border rounded flex-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Name" value={newItemName} onChange={e=>setNewItemName(e.target.value)} required />
                  <input className="p-2 border rounded w-full md:w-24 dark:bg-slate-700 dark:border-slate-600 dark:text-white" type="number" placeholder="Price" value={newItemPrice} onChange={e=>setNewItemPrice(e.target.value)} required />
                  <select className="p-2 border rounded w-full md:w-32 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItemCategory} onChange={e=>setNewItemCategory(e.target.value)}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="submit" className="bg-blue-600 text-white p-2 rounded font-bold hover:bg-blue-700">{editingItem ? 'Upd' : 'Add'}</button>
                  {editingItem && <button type="button" onClick={()=>{setEditingItem(null); setNewItemName(''); setNewItemPrice('');}} className="bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-gray-200 p-2 rounded">Cancel</button>}
                </form>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                  <thead className="bg-gray-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200"><tr><th className="p-2">Name</th><th className="p-2">Cat</th><th className="p-2">Price</th><th className="p-2 text-right">Act</th></tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {menuItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="p-2">{item.name}</td>
                        <td className="p-2 text-xs uppercase">{item.category}</td>
                        <td className="p-2">₹{item.price}</td>
                        <td className="p-2 text-right flex justify-end gap-2">
                          <button onClick={() => handleEditClick(item)} className="text-blue-600 dark:text-blue-400"><Edit size={16}/></button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-red-600 dark:text-red-400"><Trash2 size={16}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. HISTORY */}
        {showHistory && (
          <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800 rounded-t-lg">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Daily Register</h2>
                <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white"><X size={24}/></button>
              </div>
              <div className="p-4 flex justify-between items-center bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                 <div><div className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</div><div className="text-2xl font-bold text-green-600 dark:text-green-400">₹{salesHistory.reduce((a,b)=>a+b.total,0).toLocaleString()}</div></div>
                 <button onClick={handleEndDay} className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 rounded font-bold text-sm flex items-center gap-1 hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 size={16}/> End Day</button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                 <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                   <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0 shadow-sm"><tr><th className="p-3">#</th><th className="p-3">Time</th><th className="p-3 text-right">Amt</th></tr></thead>
                   <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                     {salesHistory.map(o => (
                       <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                         <td className="p-3 font-bold">#{o.token}</td>
                         <td className="p-3 text-gray-500 dark:text-gray-400">{new Date(o.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                         <td className="p-3 text-right font-bold text-green-700 dark:text-green-400">₹{o.total}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. RECEIPT */}
        {showReceipt && (
          <div className="fixed inset-0 bg-gray-900/90 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div id="printable-area" className="bg-white w-full max-w-xs p-6 shadow-2xl text-gray-900 font-mono text-sm">
              <div className="text-center border-b-2 border-dashed border-gray-800 pb-4 mb-4">
                <h1 className="text-xl font-bold uppercase">Murugan Kadai</h1>
                <p className="text-xs text-gray-500">Token</p>
                <span className="font-bold text-4xl border-2 border-black px-4 py-1 rounded inline-block">#{currentOrderId ? (activeOrders.find(o=>o.id===currentOrderId)?.token || tokenNumber) : tokenNumber}</span>
                <div className="mt-2 text-left"><span className="text-xs text-gray-500">Cust:</span> <span className="font-bold uppercase">{customerName || 'Guest'}</span></div>
              </div>
              <div className="mb-4">
                {cart.map(item => (<div key={item.id} className="flex justify-between mb-1"><span>{item.qty} x {item.name}</span><span>{(item.price * item.qty).toFixed(0)}</span></div>))}
              </div>
              <div className="border-t-2 border-dashed border-gray-800 pt-2 flex justify-between text-lg font-bold"><span>TOTAL</span><span>₹{cartTotal.toFixed(0)}</span></div>
            </div>
            <div className="mt-8 flex gap-4 print:hidden">
              <button onClick={() => setShowReceipt(false)} className="px-6 py-3 rounded-lg bg-gray-600 text-white font-bold hover:bg-gray-500">Back</button>
              <button onClick={confirmPrintAndClose} className="px-6 py-3 rounded-lg bg-green-600 text-white font-bold flex items-center gap-2 hover:bg-green-500"><Printer size={20} /> Print</button>
            </div>
            <style>{`@media print { body * { visibility: hidden; } #printable-area, #printable-area * { visibility: visible; } #printable-area { position: absolute; left: 0; top: 0; width: 100%; } .print\\:hidden { display: none !important; } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}