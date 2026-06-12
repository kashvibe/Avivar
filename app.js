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
let appSettings = {
    categories: ["Stationary", "Kitchen", "Washroom", "Farm Breakroom", "Seasonal", "Other"],
    locations: [
        "290 Springs Road Farm breakout area",
        "118 McMillan Road - bottom Farm - breakout area",
        "118 McMillan road - Office - Stationary",
        "118 McMillan road - Office + Factory - Kitchen"
    ],
    packTypes: ["Box", "Carton", "Case", "Pack", "Pallet", "Roll", "Bag", "Drum", "Tray"],
    baseUnits: ["Each", "Piece", "Roll", "Litre", "Gram", "Pair", "Cartridge", "Meter", "Unit"]
};

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
    { id: "1", itemName: "HP Officejet Pro 9130e Cartridge Black", category: "Stationary", location: appSettings.locations[2], supplier: "O'Donnells", cost: 45.00, packType: "Pack", packSize: 4, unitName: "Cartridge", totalUnits: 6, parLevel: 2, useCase: "HP Color Printer 9130e", consumptionHistory: [], expiryDate: "" },
    { id: "2", itemName: "Coles 3-ply Toilet Paper", category: "Washroom", location: appSettings.locations[1], supplier: "Coles", cost: 0.85, packType: "Box", packSize: 48, unitName: "Roll", totalUnits: 100, parLevel: 20, useCase: "", consumptionHistory: [], expiryDate: "" },
    { id: "3", itemName: "Long Life Milk 1L", category: "Kitchen", location: appSettings.locations[3], supplier: "Coles", cost: 1.65, packType: "Carton", packSize: 12, unitName: "Litre", totalUnits: 15, parLevel: 5, useCase: "", consumptionHistory: [], expiryDate: getFutureDate(12) },
    { id: "4", itemName: "Nescafé Blend 43 Coffee", category: "Kitchen", location: appSettings.locations[3], supplier: "Coles", cost: 14.50, packType: "Tin", packSize: 1, unitName: "Tin", totalUnits: 2, parLevel: 1, useCase: "", consumptionHistory: [], expiryDate: "" },
    { id: "5", itemName: "Work Gloves", category: "Farm", location: appSettings.locations[0], supplier: "Bunnings", cost: 5.00, packType: "Pack", packSize: 10, unitName: "Pair", totalUnits: 35, parLevel: 10, useCase: "", consumptionHistory: [], expiryDate: "" }
];

let inventory = [];
let activeReports = [];
let currentFilter = "All";
let currentSearch = "";
let sortColumn = "itemName";
let sortAsc = true;
let poTabActive = ""; 
let appMode = "admin"; 
let kioskLocation = "";

document.addEventListener("DOMContentLoaded", async () => {
    initRouting();
    
    // Theme Initialization
    if (localStorage.getItem("avivar_theme") === "dark") {
        document.body.classList.add("dark-mode");
    }
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark-mode");
            const isDark = document.body.classList.contains("dark-mode");
            localStorage.setItem("avivar_theme", isDark ? "dark" : "light");
        });
    }
    
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

function getEffectiveParLevel(item) {
    let par = parseInt(item.parLevel) || 0;
    if (item.parLevelUnit === 'pack') par = par * (parseInt(item.packSize) || 1);
    return par;
}

// --- FIREBASE DATA ENGINE ---
function loadData() {
    if (appMode === 'admin') {
        onSnapshot(doc(db, "settings", "main"), (docSnap) => {
            if (docSnap.exists()) {
                appSettings = docSnap.data();
            } else {
                setDoc(doc(db, "settings", "main"), appSettings);
            }
            if (typeof renderSettings === "function") renderSettings();
            populateLocationDropdowns();
        });
    }

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
    
    const docRef = doc(db, "inventory", id);
    await setDoc(docRef, {
        totalUnits: newStock,
        consumptionHistory: newHistory
    }, { merge: true });
};

window.resolveReport = function(id) {
    showConfirm("Resolve Report?", "Mark this issue as resolved and remove it from the dashboard?", async () => {
        try {
            await deleteDoc(doc(db, "reports", id));
            showToast("Report resolved.", "success");
        } catch (err) {
            showToast("Error resolving report.", "error");
        }
    });
};

window.deleteProduct = function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    showConfirm("Delete Product?", `Permanently remove "${item.itemName}" from inventory? This cannot be undone.`, async () => {
        try {
            await deleteDoc(doc(db, "inventory", id));
            showToast(`"${item.itemName}" deleted.`, "success");
        } catch (err) {
            showToast("Error deleting product.", "error");
        }
    });
};

window.restockProduct = function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const modal = document.getElementById("restockModal");
    document.getElementById("restockTitle").innerText = `Restock: ${item.itemName}`;
    document.getElementById("restockInfo").innerHTML = `Current Stock: <strong>${item.totalUnits} ${item.unitName}(s)</strong><br>Pack Size: ${item.packSize} ${item.unitName}(s) per ${item.packType}`;
    const qtyInput = document.getElementById("restockQty");
    qtyInput.value = 1;
    const calcEl = document.getElementById("restockCalc");
    const updateCalc = () => {
        const packs = parseInt(qtyInput.value) || 0;
        const units = packs * parseInt(item.packSize);
        calcEl.innerText = `Adding ${packs} ${item.packType}(s) = +${units} ${item.unitName}(s). New total: ${parseInt(item.totalUnits) + units}`;
    };
    updateCalc();
    qtyInput.oninput = updateCalc;
    modal.classList.remove("hidden");
    
    document.getElementById("cancelRestockBtn").onclick = () => modal.classList.add("hidden");
    document.getElementById("confirmRestockBtn").onclick = async () => {
        const packs = parseInt(qtyInput.value) || 0;
        if (packs <= 0) return;
        const unitsToAdd = packs * parseInt(item.packSize);
        await window.adjustStock(id, unitsToAdd, "restocked");
        modal.classList.add("hidden");
        showToast(`Restocked ${unitsToAdd} ${item.unitName}(s).`, "success");
    };
};

function exportCSV() {
    const headers = ["Item Name","Category","Location","Supplier","Cost","Pack Type","Pack Size","Unit Name","Total Units","Par Level","Use Case","Expiry Date"];
    const rows = inventory.map(i => [
        `"${i.itemName}"`, i.category, `"${i.location}"`, i.supplier, i.cost,
        i.packType, i.packSize, i.unitName, i.totalUnits, i.parLevel,
        `"${i.useCase || ''}"`, i.expiryDate || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `avivar_inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("CSV exported.", "success");
}

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split("\n").filter(l => l.trim() !== "");
        if (lines.length < 2) { showToast("CSV is empty or invalid.", "error"); return; }
        
        showToast("Importing products...", "info");
        const batch = writeBatch(db);
        let count = 0;

        // Skip header line (index 0)
        for (let i = 1; i < lines.length; i++) {
            // Split by comma, but ignore commas inside double quotes
            const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (!row || row.length < 10) continue; // Basic validation
            
            const cleanStr = (str) => str ? str.replace(/(^"|"$)/g, "").trim() : "";
            
            const id = generateId();
            const docRef = doc(db, "inventory", id);
            batch.set(docRef, {
                itemName: cleanStr(row[0]),
                category: cleanStr(row[1]),
                location: cleanStr(row[2]),
                supplier: cleanStr(row[3]),
                cost: parseFloat(cleanStr(row[4])) || 0,
                packType: cleanStr(row[5]) || "Pack",
                packSize: parseInt(cleanStr(row[6])) || 1,
                unitName: cleanStr(row[7]) || "Unit",
                totalUnits: parseInt(cleanStr(row[8])) || 0,
                parLevel: parseInt(cleanStr(row[9])) || 0,
                useCase: row[10] ? cleanStr(row[10]) : "",
                expiryDate: row[11] ? cleanStr(row[11]) : "",
                consumptionHistory: []
            });
            count++;
        }
        
        try {
            await batch.commit();
            showToast(`Successfully imported ${count} products!`, "success");
        } catch (err) {
            console.error(err);
            showToast("Failed to import CSV.", "error");
        }
    };
    reader.readAsText(file);
    event.target.value = ""; // Reset input
}

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
                    <button class="secondary-btn" onclick="adjustStock('${item.id}', -1)">-</button>
                    <button class="text-btn" onclick="restockProduct('${item.id}')">Restock</button>
                    <button class="text-btn" onclick="editProduct('${item.id}')">Edit</button>
                    <button class="text-btn" style="color:var(--danger-color)" onclick="deleteProduct('${item.id}')">Del</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    renderKPIs();
    renderActionPanel();
}

function renderKPIs() {
    const bar = document.getElementById("kpiBar");
    if (!bar) return;
    
    const totalItems = inventory.length;
    const totalValue = inventory.reduce((sum, i) => sum + (parseInt(i.totalUnits) * parseFloat(i.cost)), 0);
    const lowStock = inventory.filter(i => parseInt(i.totalUnits) <= getEffectiveParLevel(i)).length;
    const reportCount = activeReports.length;
    
    bar.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-value">${totalItems}</div>
            <div class="kpi-label">Products Tracked</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-value">$${totalValue.toFixed(0)}</div>
            <div class="kpi-label">Inventory Value</div>
        </div>
        <div class="kpi-card ${lowStock > 0 ? 'warning' : 'success'}">
            <div class="kpi-value">${lowStock}</div>
            <div class="kpi-label">Low Stock Alerts</div>
        </div>
        <div class="kpi-card ${reportCount > 0 ? 'danger' : 'success'}">
            <div class="kpi-value">${reportCount}</div>
            <div class="kpi-label">Active Reports</div>
        </div>
    `;
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
    let flagged = inventory.filter(i => parseInt(i.totalUnits) <= getEffectiveParLevel(i));
    flagged.forEach(item => {
        hasStockAlerts = true;
        const li = document.createElement("li");
        li.className = "flagged-item warning";
        li.innerHTML = `
            <div class="flagged-info">
                <span class="flagged-item-name">${item.itemName}</span>
                <span class="flagged-item-details">Stock: ${item.totalUnits} / Par: ${item.parLevel} ${item.parLevelUnit === 'pack' ? (item.packType + 's') : (item.unitName + 's')}</span>
                <span class="flagged-item-details">${item.location}</span>
            </div>
        `;
        stockList.appendChild(li);
    });

    if (!hasStockAlerts) {
        stockList.innerHTML = `<li class="flagged-item" style="border:none; justify-content:center; color:var(--text-secondary);">All stock levels are nominal.</li>`;
    }

    // 3. Render Expiry Alerts
    const now = new Date();
    inventory.forEach(item => {
        if (!item.expiryDate) return;
        const diffDays = Math.ceil((new Date(item.expiryDate) - now) / 86400000);
        if (diffDays <= 14 && diffDays >= 0) {
            const li = document.createElement("li");
            li.className = "flagged-item warning";
            li.innerHTML = `
                <div class="flagged-info">
                    <span class="flagged-item-name">${item.itemName}</span>
                    <span class="flagged-item-details">Expires in ${diffDays} day(s) - ${item.expiryDate}</span>
                </div>
            `;
            stockList.appendChild(li);
        } else if (diffDays < 0) {
            const li = document.createElement("li");
            li.className = "flagged-item danger";
            li.innerHTML = `
                <div class="flagged-info">
                    <span class="flagged-item-name">${item.itemName}</span>
                    <span class="flagged-item-details">EXPIRED ${Math.abs(diffDays)} day(s) ago!</span>
                </div>
            `;
            stockList.appendChild(li);
        }
    });

    // PO Logic
    const poData = {};
    inventory.forEach(item => {
        if (item.supplier && parseInt(item.totalUnits) <= getEffectiveParLevel(item)) {
            if (!poData[item.supplier]) poData[item.supplier] = [];
            const targetUnits = Math.max(getEffectiveParLevel(item) * 2, parseInt(item.packSize));
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

    const spendMap = {}; appSettings.locations.forEach(l => spendMap[l] = 0);
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
    locSelect.innerHTML = "";
    appSettings.locations.forEach(l => {
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

    // CSV Export & Import
    document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);
    const importBtn = document.getElementById("importCsvBtn");
    const fileInput = document.getElementById("csvFileInput");
    if (importBtn && fileInput) {
        importBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", handleCSVImport);
    }
    
    initSettingsEvents();

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            e.preventDefault(); document.getElementById("searchInput").focus();
        }
        if (e.altKey && e.key === "n") { e.preventDefault(); window.editProduct(null); }
    });
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
    if(select) {
        select.innerHTML = "";
        appSettings.locations.forEach(l => { const opt = document.createElement("option"); opt.value = l; opt.innerText = l; select.appendChild(opt); });
    }
    
    const catSelect = document.getElementById("category");
    if(catSelect) {
        catSelect.innerHTML = "";
        appSettings.categories.forEach(c => { const opt = document.createElement("option"); opt.value = c; opt.innerText = c; catSelect.appendChild(opt); });
    }

    const packDatalist = document.getElementById("packNameOptions");
    if(packDatalist) packDatalist.innerHTML = appSettings.packTypes.map(p => `<option value="${p}">`).join("");

    const unitDatalist = document.getElementById("unitNameOptions");
    if(unitDatalist) unitDatalist.innerHTML = appSettings.baseUnits.map(u => `<option value="${u}">`).join("");

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
            document.getElementById("parLevelUnit").value = item.parLevelUnit || "unit";
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
        parLevelUnit: document.getElementById("parLevelUnit").value,
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
        const pack = item.packType ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">1 ${item.packType} = ${item.packSize} ${item.unitName}(s)</div>` : "";
        card.innerHTML = `
            <h3>${item.itemName}</h3>
            ${pack}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                <div class="stock-readout">${stockDisplay}</div>
                <button class="btn-take" onclick="window.takeItemKiosk('${item.id}', event)">Take 1 ${item.unitName}</button>
            </div>
            <button class="text-btn" style="color:var(--warning-color);" onclick="window.flagDiscarded('${item.id}')">Flag 1 Discarded</button>
        `;
        grid.appendChild(card);
    });
}

// --- SETTINGS ENGINE ---
function renderSettings() {
    const renderList = (id, arr, key) => {
        const ul = document.getElementById(id);
        if(!ul) return;
        ul.innerHTML = "";
        arr.forEach((val, i) => {
            const li = document.createElement("li");
            li.innerHTML = `<span>${val}</span> <button class="delete-btn" onclick="removeSetting('${key}', ${i})">✖</button>`;
            ul.appendChild(li);
        });
    };
    renderList("settingsCategoryList", appSettings.categories, "categories");
    renderList("settingsLocationList", appSettings.locations, "locations");
    renderList("settingsPackTypeList", appSettings.packTypes, "packTypes");
    renderList("settingsUnitList", appSettings.baseUnits, "baseUnits");
}

async function saveSettings() {
    await setDoc(doc(db, "settings", "main"), appSettings);
    showToast("Settings updated successfully", "success");
}

window.removeSetting = async function(key, index) {
    appSettings[key].splice(index, 1);
    await saveSettings();
};

function initSettingsEvents() {
    const setupAdd = (btnId, inputId, key) => {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        btn.addEventListener("click", async () => {
            const input = document.getElementById(inputId);
            const val = input.value.trim();
            if(val) {
                appSettings[key].push(val);
                input.value = "";
                await saveSettings();
            }
        });
    };
    setupAdd("addCategoryBtn", "newCategoryInput", "categories");
    setupAdd("addLocationBtn", "newLocationInput", "locations");
    setupAdd("addPackTypeBtn", "newPackTypeInput", "packTypes");
    setupAdd("addUnitBtn", "newUnitInput", "baseUnits");
}

window.takeItemKiosk = function(id, e) {
    window.adjustStock(id, -1, "consumed");
    const btn = e.currentTarget; const origText = btn.innerText;
    btn.innerText = "Logged!"; btn.style.background = "var(--success-color)";
    setTimeout(() => { btn.innerText = origText; btn.style.background = ""; }, 1000);
}

window.flagDiscarded = function(id) {
    showConfirm(
        "Discard Item?",
        "Mark 1 unit as discarded/expired? This will not impact your normal consumption rate prediction.",
        () => { window.adjustStock(id, -1, "discarded"); }
    );
}
