import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, writeBatch, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBjsUL6YB4PZjT0RXwzoQkQXKcno4fk91A",
  authDomain: "avivar-82377.firebaseapp.com",
  projectId: "avivar-82377",
  storageBucket: "avivar-82377.firebasestorage.app",
  messagingSenderId: "670821781658",
  appId: "1:670821781658:web:317921770b546e8d598f23",
  measurementId: "G-SL568D5GVQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Avivar V3 Logic ---
const LOCATIONS = [
    "290 Springs Road Farm breakout area",
    "118 McMillan Road - bottom Farm - breakout area",
    "118 McMillan road - Office - Stationary",
    "118 McMillan road - Office + Factory - Kitchen"
];

// --- Custom UI Engines ---
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add("show"), 10);
    
    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById("customConfirmModal");
    document.getElementById("confirmTitle").innerText = title;
    document.getElementById("confirmMessage").innerText = message;
    
    const yesBtn = document.getElementById("confirmYesBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    
    // Remove old listeners by cloning
    const newYes = yesBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    yesBtn.replaceWith(newYes);
    cancelBtn.replaceWith(newCancel);
    
    modal.classList.remove("hidden");
    
    newCancel.addEventListener("click", () => modal.classList.add("hidden"));
    newYes.addEventListener("click", () => {
        modal.classList.add("hidden");
        onConfirm();
    });
}

// --- Security & PIN Lock ---
const ADMIN_PIN = "9090"; // Extremely secure for basic internal use

function checkAdminPin() {
    return new Promise((resolve) => {
        const vault = document.getElementById("pinVault");
        const pinInput = document.getElementById("pinInput");
        const btn = document.getElementById("pinSubmitBtn");
        const err = document.getElementById("pinError");
        
        vault.classList.remove("hidden");
        pinInput.focus();
        
        const tryUnlock = () => {
            if (pinInput.value === ADMIN_PIN) {
                vault.classList.add("hidden");
                resolve(true);
            } else {
                err.innerText = "Incorrect PIN.";
                pinInput.value = "";
                pinInput.focus();
                setTimeout(() => err.innerText = "", 2000);
            }
        };
        
        btn.onclick = tryUnlock;
        pinInput.onkeyup = (e) => { if (e.key === "Enter") tryUnlock(); };
    });
}

// Seed Data for initial migration
const seedData = [
    { id: "1", itemName: "HP Officejet Pro 9130e Cartridge Black", category: "Stationary", location: LOCATIONS[2], supplier: "O'Donnells", cost: 45.00, packType: "Pack", packSize: 4, unitName: "Cartridge", totalUnits: 6, parLevel: 2, useCase: "HP Color Printer 9130e", consumptionHistory: [], expiryDate: "" },
    { id: "2", itemName: "Coles 3-ply Toilet Paper", category: "Washroom", location: LOCATIONS[1], supplier: "Coles", cost: 0.85, packType: "Box", packSize: 48, unitName: "Roll", totalUnits: 100, parLevel: 20, useCase: "", consumptionHistory: [], expiryDate: "" },
    { id: "3", itemName: "Long Life Milk 1L", category: "Kitchen", location: LOCATIONS[3], supplier: "Coles", cost: 1.65, packType: "Carton", packSize: 12, unitName: "Litre", totalUnits: 15, parLevel: 5, useCase: "", consumptionHistory: [], expiryDate: getFutureDate(12) },
    { id: "4", itemName: "Nescafé Blend 43 Coffee", category: "Kitchen", location: LOCATIONS[3], supplier: "Coles", cost: 14.50, packType: "Tin", packSize: 1, unitName: "Tin", totalUnits: 2, parLevel: 1, useCase: "", consumptionHistory: [], expiryDate: "" },
    { id: "5", itemName: "Work Gloves", category: "Farm", location: LOCATIONS[0], supplier: "Bunnings", cost: 5.00, packType: "Pack", packSize: 10, unitName: "Pair", totalUnits: 35, parLevel: 10, useCase: "", consumptionHistory: [], expiryDate: "" }
];

let inventory = [];
let currentFilter = "All";
let currentSearch = "";
let sortColumn = "itemName";
let sortAsc = true;
let poTabActive = ""; 
let appMode = "admin"; 
let kioskLocation = "";

document.addEventListener("DOMContentLoaded", async () => {
    initRouting();
    
    // UI Events & Security
    if (appMode === 'admin') {
        const unlocked = await checkAdminPin();
        if (unlocked) {
            initAdminEvents();
            loadData();
        }
    } else {
        initKioskEvents();
        loadData();
    }
});

// --- URL Routing ---
function initRouting() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "kiosk") {
        appMode = "kiosk";
        kioskLocation = params.get("location");
        document.getElementById("adminView").classList.add("hidden");
        document.getElementById("kioskView").classList.remove("hidden");
        document.getElementById("kioskLocationTitle").innerText = kioskLocation || "Select a Location";
    } else {
        appMode = "admin";
        document.getElementById("adminView").classList.remove("hidden");
        document.getElementById("kioskView").classList.add("hidden");
        populateLocationDropdowns();
    }
}

// --- Utility Functions ---
function generateId() { return Math.random().toString(36).substr(2, 9); }
function getFutureDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }

function formatStock(totalUnits, packSize, packType, unitName) {
    totalUnits = parseInt(totalUnits);
    packSize = parseInt(packSize);
    
    if (packSize === 1 || isNaN(packSize) || packSize === 0) return `${totalUnits} ${unitName}(s)`;
    
    const packs = Math.floor(totalUnits / packSize);
    const individuals = totalUnits % packSize;
    
    if (packs > 0 && individuals > 0) return `${packs} ${packType}(s) (of ${packSize}) and ${individuals} loose ${unitName}(s)`;
    if (packs > 0 && individuals === 0) return `${packs} ${packType}(s) (of ${packSize})`;
    if (packs === 0 && individuals > 0) return `${individuals} loose ${unitName}(s)`;
    return "0";
}

function calculateDaysRemaining(item) {
    if (!item.consumptionHistory || item.consumptionHistory.length === 0) return null;
    const now = Date.now();
    const fourteenDaysAgo = now - (14 * 86400000);
    const recentUsage = item.consumptionHistory
        .filter(entry => entry.timestamp >= fourteenDaysAgo && entry.reason === "consumed")
        .reduce((sum, entry) => sum + entry.quantity, 0);
        
    if (recentUsage === 0) return Infinity;
    return parseInt(item.totalUnits) / (recentUsage / 14); 
}

// --- FIREBASE DATA ENGINE ---
function loadData() {
    onSnapshot(collection(db, "inventory"), (snapshot) => {
        inventory = [];
        snapshot.forEach(doc => inventory.push({ id: doc.id, ...doc.data() }));
        
        if (inventory.length === 0 && appMode === 'admin') migrateLocalToFirebase();
        else if (appMode === 'admin') { renderAdmin(); drawAnalytics(); renderActionPanel(); }
        else if (appMode === 'kiosk') renderKiosk();
    }, (error) => {
        console.error("Firestore sync error:", error);
        if (error.code === 'permission-denied') {
            showToast("Database Permission Denied. Check Firebase rules.", "error");
        }
    });

    if (appMode === 'admin') {
        onSnapshot(collection(db, "reports"), (snapshot) => {
            activeReports = [];
            snapshot.forEach(doc => activeReports.push({ id: doc.id, ...doc.data() }));
            renderActionPanel();
        });
    }
}

async function migrateLocalToFirebase() {
    console.log("Migrating local database to Firebase Cloud...");
    const localData = localStorage.getItem("avivar_v2_inventory");
    let initialData = seedData;
    if (localData) initialData = JSON.parse(localData);
    
    const batch = writeBatch(db);
    initialData.forEach(item => {
        const docRef = doc(db, "inventory", item.id);
        batch.set(docRef, item);
    });
    
    await batch.commit();
    console.log("Migration complete!");
}

// Global functions for inline HTML event handlers
window.adjustStock = async function(id, change, reason = "consumed") {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    
    const oldStock = parseInt(item.totalUnits);
    const newStock = Math.max(0, oldStock + change);
    
    let newHistory = [...(item.consumptionHistory || [])];
    if (newStock < oldStock) {
        newHistory.push({
            timestamp: Date.now(),
            quantity: oldStock - newStock,
            costAtTime: parseFloat(item.cost),
            reason: reason
        });
    }
    
    // Push update directly to cloud. onSnapshot will automatically re-render the UI on all devices!
    const docRef = doc(db, "inventory", id);
    await setDoc(docRef, {
        totalUnits: newStock,
        consumptionHistory: newHistory
    }, { merge: true });
};

// --- ADMIN RENDER LOGIC ---
function renderAdmin() {
    const tbody = document.getElementById("inventoryBody");
    tbody.innerHTML = "";

    inventory.forEach(item => { item._daysRemaining = calculateDaysRemaining(item); });

    let filtered = inventory.filter(item => {
        const matchLoc = currentFilter === "All" || item.location === currentFilter;
        const matchSearch = item.itemName.toLowerCase().includes(currentSearch.toLowerCase()) ||
                            (item.supplier && item.supplier.toLowerCase().includes(currentSearch.toLowerCase()));
        return matchLoc && matchSearch;
    });

    // Sort Override for Critical (< 2 days)
    filtered.sort((a, b) => {
        const aCritical = a._daysRemaining !== null && a._daysRemaining < 2;
        const bCritical = b._daysRemaining !== null && b._daysRemaining < 2;
        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;

        let valA = a[sortColumn]; let valB = b[sortColumn];
        if (sortColumn === 'daysRemaining') {
            valA = a._daysRemaining === null ? 9999 : a._daysRemaining;
            valB = b._daysRemaining === null ? 9999 : b._daysRemaining;
        }
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    filtered.forEach(item => {
        const tr = document.createElement("tr");
        let rowClasses = ""; let flagsHtml = "";
        
        let daysStr = "Calculating...";
        if (item._daysRemaining !== null && item._daysRemaining !== Infinity) {
            daysStr = `~${Math.round(item._daysRemaining)}d`;
            if (item._daysRemaining < 2) {
                rowClasses += "alert-red ";
                flagsHtml += `<span class="badge badge-danger">Critical</span>`;
            } else if (item._daysRemaining < 5) {
                flagsHtml += `<span class="badge badge-warning">Low</span>`;
            }
        } else if (item._daysRemaining === Infinity) { daysStr = "No Usage"; }

        const stockDisplay = formatStock(item.totalUnits, item.packSize, item.packType, item.unitName);
        const useCaseBadge = item.useCase ? `<span class="badge badge-info" style="margin-left: 0; margin-top: 4px; display: inline-block;">${item.useCase}</span>` : "";
        
        tr.className = rowClasses.trim();
        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${item.itemName} ${flagsHtml}</div>
                ${useCaseBadge}
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 4px;">${item.category}</div>
            </td>
            <td>${item.location}</td>
            <td>${item.supplier}</td>
            <td>
                <div class="stock-complex">
                    <span class="stock-primary">${stockDisplay}</span>
                </div>
            </td>
            <td>${item.parLevel}</td>
            <td><span style="font-weight:600">${daysStr}</span></td>
            <td>
                <div class="action-btns">
                    <button class="secondary-btn" onclick="adjustStock('${item.id}', 1)">+</button>
                    <button class="secondary-btn" onclick="adjustStock('${item.id}', -1)">−</button>
                    <button class="text-btn" onclick="editProduct('${item.id}')">Edit</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    renderActionPanel();
}

function renderActionPanel() {
    const stockList = document.getElementById("flaggedItemsList");
    const reportsList = document.getElementById("emergencyReportsList");
    if (!stockList || !reportsList) return;
    
    stockList.innerHTML = "";
    reportsList.innerHTML = "";
    
    let hasStockAlerts = false;
    let hasReports = false;

    // 1. Render Active Reports
    activeReports.sort((a, b) => b.timestamp - a.timestamp).forEach(report => {
        hasReports = true;
        const li = document.createElement("li");
        li.className = "flagged-item danger";
        li.innerHTML = `
            <div class="flagged-info">
                <span class="flagged-item-name">[URGENT] Pantry Empty</span>
                <span class="flagged-item-details">${report.location}</span>
                <span class="flagged-item-details" style="font-weight:500;">"${report.note}"</span>
            </div>
            <button class="btn-purchase" onclick="resolveReport('${report.id}')">Resolve</button>
        `;
        reportsList.appendChild(li);
    });

    if (!hasReports) {
        reportsList.innerHTML = `<li class="flagged-item" style="border:none; justify-content:center; color:var(--text-secondary);">All clear. No active reports.</li>`;
    }

    // 2. Render Low Stock Items
    let flagged = inventory.filter(i => parseInt(i.totalUnits) <= parseInt(i.parLevel));
    flagged.forEach(item => {
        hasStockAlerts = true;
        const li = document.createElement("li");
        li.className = "flagged-item warning";
        li.innerHTML = `
            <div class="flagged-info">
                <span class="flagged-item-name">${item.itemName}</span>
                <span class="flagged-item-details">Stock: ${item.totalUnits} / Par: ${item.parLevel}</span>
                <span class="flagged-item-details">${item.location}</span>
            </div>
        `;
        stockList.appendChild(li);
    });

    if (!hasStockAlerts) {
        stockList.innerHTML = `<li class="flagged-item" style="border:none; justify-content:center; color:var(--text-secondary);">All stock levels are nominal.</li>`;
    }

    // PO Logic
    const poData = {};
    inventory.forEach(item => {
        if (item.supplier && parseInt(item.totalUnits) <= parseInt(item.parLevel)) {
            if (!poData[item.supplier]) poData[item.supplier] = [];
            const targetUnits = Math.max(parseInt(item.parLevel) * 2, parseInt(item.packSize));
            const unitsNeeded = Math.max(1, targetUnits - parseInt(item.totalUnits));
            const packsToOrder = Math.ceil(unitsNeeded / (parseInt(item.packSize) || 1));
            poData[item.supplier].push(`${packsToOrder}x ${item.packType} of ${item.itemName}`);
        }
    });
    renderPOTabs(poData);
}

function renderPOTabs(poData) {
    const tabsContainer = document.getElementById("poTabs");
    const content = document.getElementById("poContent");
    const suppliers = Object.keys(poData);
    
    tabsContainer.innerHTML = "";
    if (suppliers.length === 0) { content.value = "No items require ordering."; return; }
    if (!suppliers.includes(poTabActive)) poTabActive = suppliers[0];

    suppliers.forEach(supplier => {
        const btn = document.createElement("button");
        btn.className = `po-tab ${supplier === poTabActive ? 'active' : ''}`;
        btn.innerText = supplier;
        btn.onclick = () => { poTabActive = supplier; renderPOTabs(poData); };
        tabsContainer.appendChild(btn);
    });

    if (poData[poTabActive]) {
        content.value = `Purchase Request: ${poTabActive}\nDate: ${new Date().toLocaleDateString()}\n\n` + poData[poTabActive].join("\n");
    }
}

// --- Analytics Engine ---
function drawAnalytics() {
    const canvas = document.getElementById("volumeChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const spendMap = {}; LOCATIONS.forEach(l => spendMap[l] = 0);
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 86400000);
    const sevenDaysAgo = now - (7 * 86400000);
    let dayBuckets = [0,0,0,0,0,0,0];

    inventory.forEach(item => {
        item.consumptionHistory.forEach(entry => {
            if (entry.timestamp >= thirtyDaysAgo) spendMap[item.location] += (entry.quantity * entry.costAtTime);
            if (entry.timestamp >= sevenDaysAgo) {
                const dayIndex = 6 - Math.floor((now - entry.timestamp) / 86400000);
                if(dayIndex >= 0 && dayIndex < 7) dayBuckets[dayIndex] += entry.quantity;
            }
        });
    });

    const spendList = document.getElementById("spendList");
    spendList.innerHTML = "";
    Object.keys(spendMap).forEach(loc => {
        if (spendMap[loc] > 0) {
            const li = document.createElement("li");
            li.className = "spend-item";
            li.innerHTML = `<span class="spend-item-loc">${loc}</span> <span class="spend-item-amt">$${spendMap[loc].toFixed(2)}</span>`;
            spendList.appendChild(li);
        }
    });

    const maxVal = Math.max(...dayBuckets, 10); 
    const barWidth = 40; const spacing = 30; const startX = 50; const bottomY = canvas.height - 30;

    ctx.fillStyle = "#64748b"; ctx.font = "12px Inter";
    dayBuckets.forEach((val, i) => {
        const barHeight = (val / maxVal) * (canvas.height - 60);
        const x = startX + (i * (barWidth + spacing));
        const y = bottomY - barHeight;
        
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = "#64748b";
        ctx.fillText(`Day ${i+1}`, x, bottomY + 20);
        if (val > 0) ctx.fillText(val, x + 10, y - 5);
    });
}

// --- ADMIN EVENTS ---
function initAdminEvents() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            document.querySelectorAll(".view-section").forEach(v => v.classList.add("hidden"));
            document.getElementById(`${e.currentTarget.dataset.view}View`).classList.remove("hidden");
            if (e.currentTarget.dataset.view === 'analytics') drawAnalytics();
        });
    });

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            currentFilter = e.currentTarget.dataset.filter;
            renderAdmin();
        });
    });

    document.getElementById("searchInput").addEventListener("input", (e) => { currentSearch = e.target.value; renderAdmin(); });
    document.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (sortColumn === col) sortAsc = !sortAsc;
            else { sortColumn = col; sortAsc = true; }
            renderAdmin();
        });
    });

    document.getElementById("addBtn").addEventListener("click", () => window.editProduct(null));
    document.getElementById("cancelBtn").addEventListener("click", closeModal);
    document.getElementById("productForm").addEventListener("submit", saveProduct);

    const locSelect = document.getElementById("kioskLocationSelect");
    LOCATIONS.forEach(l => {
        const opt = document.createElement("option"); opt.value = l; opt.innerText = l;
        locSelect.appendChild(opt);
    });

    document.getElementById("generateKioskBtn").addEventListener("click", () => {
        const loc = document.getElementById("kioskLocationSelect").value;
        const url = window.location.href.split('?')[0] + "?mode=kiosk&location=" + encodeURIComponent(loc);
        const out = document.getElementById("kioskUrlOutput");
        out.value = url;
        out.classList.remove("hidden");
        const openBtn = document.getElementById("openKioskBtn");
        openBtn.onclick = () => window.open(url, '_blank');
        openBtn.classList.remove("hidden");
        const qrImg = document.getElementById("qrCodeImg");
        const qrContainer = document.getElementById("qrCodeContainer");
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
        qrContainer.classList.remove("hidden");
    });

    document.getElementById("emailAlertsBtn").addEventListener("click", () => {
        const text = document.getElementById("poContent").value;
        showToast("Opening Email Client...", "info");
        window.open(`mailto:?subject=Avivar Purchase Order&body=${encodeURIComponent(text)}`, '_blank');
    });

    document.getElementById("copyPoBtn").addEventListener("click", () => {
        const content = document.getElementById("poContent").value;
        navigator.clipboard.writeText(content).then(() => {
            const btn = document.getElementById("copyPoBtn");
            const originalText = btn.innerText;
            btn.innerText = "Copied!"; btn.style.backgroundColor = "var(--success-color)"; btn.style.color = "#fff";
            setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = ""; btn.style.color = ""; }, 1500);
        }).catch(err => { showToast("Failed to copy text.", "error"); });
    });

    document.getElementById("totalUnits").addEventListener("input", updatePackHelper);
    document.getElementById("packSize").addEventListener("input", updatePackHelper);
}

function updatePackHelper() {
    const tu = parseInt(document.getElementById("totalUnits").value) || 0;
    const ps = parseInt(document.getElementById("packSize").value) || 1;
    const pt = document.getElementById("packName").value || "Pack";
    const un = document.getElementById("unitName").value || "Unit";
    document.getElementById("stockCalcHelper").innerText = `Calculates to: ${formatStock(tu, ps, pt, un)}`;
}

function populateLocationDropdowns() {
    const select = document.getElementById("location");
    select.innerHTML = "";
    LOCATIONS.forEach(l => { const opt = document.createElement("option"); opt.value = l; opt.innerText = l; select.appendChild(opt); });
    
    const datalist = document.getElementById("useCaseOptions");
    if(datalist) {
        const useCases = [...new Set(inventory.map(i => i.useCase).filter(s => s))];
        datalist.innerHTML = useCases.map(s => `<option value="${s}">`).join("");
    }
}

window.editProduct = function(id = null) {
    const form = document.getElementById("productForm");
    form.reset();
    document.getElementById("productId").value = "";

    if (id) {
        document.getElementById("modalTitle").innerText = "Edit Product";
        const item = inventory.find(i => i.id === id);
        if (item) {
            document.getElementById("productId").value = item.id;
            document.getElementById("itemName").value = item.itemName;
            document.getElementById("category").value = item.category;
            document.getElementById("location").value = item.location;
            document.getElementById("supplier").value = item.supplier;
            document.getElementById("cost").value = item.cost;
            document.getElementById("useCase").value = item.useCase || "";
            document.getElementById("packName").value = item.packType || "Pack";
            document.getElementById("packSize").value = item.packSize || 1;
            document.getElementById("unitName").value = item.unitName || "Unit";
            document.getElementById("totalUnits").value = item.totalUnits;
            document.getElementById("parLevel").value = item.parLevel;
            document.getElementById("expiryDate").value = item.expiryDate || "";
        }
    } else { document.getElementById("modalTitle").innerText = "Add New Product"; }
    updatePackHelper();
    document.getElementById("productModal").classList.remove("hidden");
}

function closeModal() { document.getElementById("productModal").classList.add("hidden"); }

async function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("productId").value || generateId();
    const newItem = {
        id: id,
        itemName: document.getElementById("itemName").value,
        category: document.getElementById("category").value,
        location: document.getElementById("location").value,
        supplier: document.getElementById("supplier").value,
        cost: parseFloat(document.getElementById("cost").value) || 0,
        useCase: document.getElementById("useCase").value,
        packType: document.getElementById("packName").value,
        packSize: parseInt(document.getElementById("packSize").value) || 1,
        unitName: document.getElementById("unitName").value,
        totalUnits: parseInt(document.getElementById("totalUnits").value) || 0,
        parLevel: parseInt(document.getElementById("parLevel").value) || 0,
        expiryDate: document.getElementById("expiryDate").value,
        consumptionHistory: id ? (inventory.find(i => i.id === id)?.consumptionHistory || []) : []
    };
    
    // Save to Firebase directly
    const docRef = doc(db, "inventory", id);
    await setDoc(docRef, newItem);
    closeModal();
}

// --- KIOSK LOGIC (STAFF SELF-LOGGING) ---
function initKioskEvents() {
    document.getElementById("exitKioskBtn").addEventListener("click", () => {
        window.location.href = window.location.href.split('?')[0];
    });
    
    const fab = document.createElement("button");
    fab.className = "kiosk-fab";
    fab.innerText = "Report Empty Item";
    fab.onclick = () => document.getElementById("reportEmptyModal").classList.remove("hidden");
    document.body.appendChild(fab);

    document.getElementById("cancelReportBtn").addEventListener("click", () => {
        document.getElementById("reportEmptyModal").classList.add("hidden");
    });
    
    document.getElementById("submitReportBtn").addEventListener("click", async () => {
        const note = document.getElementById("reportNotes").value;
        if(note) {
            try {
                await addDoc(collection(db, "reports"), {
                    location: kioskLocation,
                    note: note,
                    timestamp: Date.now()
                });
                showToast("Report submitted.", "success");
                document.getElementById("reportNotes").value = "";
                document.getElementById("reportEmptyModal").classList.add("hidden");
            } catch (err) {
                showToast("Failed to submit report. Connection error.", "error");
            }
        }
    });
}

function renderKiosk() {
    const grid = document.getElementById("kioskGrid");
    grid.innerHTML = "";
    const localInventory = inventory.filter(i => i.location === kioskLocation);
    
    if (localInventory.length === 0) { grid.innerHTML = "<p>No items assigned to this pantry.</p>"; return; }

    localInventory.forEach(item => {
        const card = document.createElement("div");
        card.className = "kiosk-card";
        const stockDisplay = formatStock(item.totalUnits, item.packSize, item.packType, item.unitName);
        card.innerHTML = `
            <h3>${item.itemName}</h3>
            <div class="stock-readout">Current: <strong>${stockDisplay}</strong></div>
            <button class="btn-take" onclick="window.takeItemKiosk('${item.id}')">Take 1 ${item.unitName}</button>
            <button class="text-btn" style="color:var(--warning-color);" onclick="window.flagDiscarded('${item.id}')">Flag 1 Discarded</button>
        `;
        grid.appendChild(card);
    });
}

window.takeItemKiosk = function(id) {
    window.adjustStock(id, -1, "consumed");
    const btn = event.target; const origText = btn.innerText;
    btn.innerText = "✓ Logged"; btn.style.background = "var(--success-color)";
    setTimeout(() => { btn.innerText = origText; btn.style.background = ""; }, 1000);
}

window.flagDiscarded = function(id) {
    showConfirm(
        "Discard Item?",
        "Mark 1 unit as discarded/expired? This will not impact your normal consumption rate prediction.",
        () => { window.adjustStock(id, -1, "discarded"); }
    );
}
