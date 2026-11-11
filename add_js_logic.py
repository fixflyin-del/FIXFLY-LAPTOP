import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace handleGoogleOneClickLogin implementation
old_google_func = '''    // --- CONTINUING WITH GOOGLE (POINT 5) ---
    function handleGoogleOneClickLogin() {
      try {
        let name = '';
        let email = '';

        // Check if customer already has saved profile
        const saved = JSON.parse(localStorage.getItem('fixfly_saved_customer'));
        if (saved && saved.email && saved.name) {
          name = saved.name;
          email = saved.email;
        } else {
          const entered = prompt('Sign in with Google Account:\\nEnter your email address (or leave blank to auto-use Google profile):', 'rahul.sharma@gmail.com');
          if (entered === null) return; // User cancelled
          email = entered.trim() || 'rahul.sharma@gmail.com';
          const localPart = email.split('@')[0];
          name = localPart.replace(/[._]/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
        }

        const userObj = { name, email, signedInAt: new Date().toISOString() };
        AppState.googleUser = userObj;
        localStorage.setItem('fixfly_google_user', JSON.stringify(userObj));

        // Save into persistent profile memory
        saveCustomerProfile({ name, email });

        const nameInput = document.getElementById('checkout-cust-name');
        const emailInput = document.getElementById('checkout-cust-email');
        const statusEl = document.getElementById('google-user-status');

        if (nameInput) nameInput.value = name;
        if (emailInput) emailInput.value = email;
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-emerald-700 font-extrabold">✓ Signed in with Google:</span> <span class="text-slate-800">${name} (${email})</span>`;
        }
      } catch (err) {
        console.warn('Google sign in error:', err);
        const fallback = { name: 'Customer', email: 'customer@gmail.com' };
        AppState.googleUser = fallback;
        const nameInput = document.getElementById('checkout-cust-name');
        const emailInput = document.getElementById('checkout-cust-email');
        if (nameInput) nameInput.value = fallback.name;
        if (emailInput) emailInput.value = fallback.email;
      }
    }'''

new_google_and_orders_func = '''    // --- GOOGLE ONE-CLICK ACCOUNT CHOOSER (USER REQUEST POINT 2) ---
    function handleGoogleOneClickLogin() {
      openGoogleAccountChooser();
    }

    function openGoogleAccountChooser() {
      const saved = JSON.parse(localStorage.getItem('fixfly_saved_customer')) || {};
      const primaryNameEl = document.getElementById('google-primary-name');
      const primaryEmailEl = document.getElementById('google-primary-email');
      
      const defaultEmail = saved.email || 'ayatarmanok@gmail.com';
      const defaultName = saved.name || (defaultEmail.includes('@') ? defaultEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase()) : 'Ayat Arman');
      
      if (primaryNameEl) primaryNameEl.innerText = defaultName;
      if (primaryEmailEl) primaryEmailEl.innerText = defaultEmail;

      const modal = document.getElementById('google-account-chooser-modal');
      if (modal) modal.classList.remove('hidden');
    }

    function closeGoogleAccountChooser() {
      const modal = document.getElementById('google-account-chooser-modal');
      if (modal) modal.classList.add('hidden');
    }

    function selectGoogleAccount(name, email) {
      const userObj = { name, email, signedInAt: new Date().toISOString() };
      AppState.googleUser = userObj;
      localStorage.setItem('fixfly_google_user', JSON.stringify(userObj));

      saveCustomerProfile({ name, email });

      const nameInput = document.getElementById('checkout-cust-name');
      const emailInput = document.getElementById('checkout-cust-email');
      const statusEl = document.getElementById('google-user-status');

      if (nameInput) nameInput.value = name;
      if (emailInput) emailInput.value = email;
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-emerald-700 font-extrabold flex items-center gap-1">✓ Signed in with Google:</span> <span class="text-slate-800 font-bold">${name} (${email})</span>`;
      }

      closeGoogleAccountChooser();
    }

    function submitCustomGoogleAccount() {
      const input = document.getElementById('google-custom-email-input');
      const email = input ? input.value.trim() : '';
      if (!email || !email.includes('@')) {
        alert('Please enter a valid Google email address.');
        return;
      }
      const localPart = email.split('@')[0];
      const name = localPart.replace(/[._]/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      selectGoogleAccount(name, email);
    }

    // --- MY ORDERS & LIVE TRACKING (USER REQUEST POINT 3) ---
    function openMyOrdersModal() {
      const modal = document.getElementById('my-orders-modal');
      if (modal) modal.classList.remove('hidden');
      loadMyOrdersList(true);
    }

    function closeMyOrdersModal() {
      const modal = document.getElementById('my-orders-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function loadMyOrdersList(forceFetch = false) {
      const container = document.getElementById('my-orders-list-container');
      if (!container) return;

      container.innerHTML = `
        <div class="py-8 text-center text-slate-400">
          <div class="inline-block animate-spin w-6 h-6 border-2 border-brandBlue border-t-transparent rounded-full mb-2"></div>
          <p class="text-xs">Loading your order history...</p>
        </div>
      `;

      let orders = [];

      try {
        const res = await fetch(BACKEND_BASE_URL + '/api/orders?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          orders = data.orders || [];
        }
      } catch (e) {
        console.warn('API error, using local orders:', e);
      }

      const local = JSON.parse(localStorage.getItem('fixfly_orders')) || [];
      const mergedMap = new Map();
      orders.forEach(o => mergedMap.set(o.orderId, o));
      local.forEach(o => {
        if (!mergedMap.has(o.orderId)) mergedMap.set(o.orderId, o);
      });

      let allOrders = Array.from(mergedMap.values());
      allOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      renderMyOrdersView(allOrders);
    }

    function searchMyOrders() {
      const query = (document.getElementById('my-orders-search-input').value || '').trim().toLowerCase();
      const local = JSON.parse(localStorage.getItem('fixfly_orders')) || [];
      if (!query) {
        loadMyOrdersList();
        return;
      }

      const filtered = local.filter(o => {
        const idMatch = o.orderId && o.orderId.toLowerCase().includes(query);
        const phoneMatch = o.customer && o.customer.phone && o.customer.phone.includes(query);
        const emailMatch = o.customer && o.customer.email && o.customer.email.toLowerCase().includes(query);
        return idMatch || phoneMatch || emailMatch;
      });

      renderMyOrdersView(filtered, query);
    }

    function renderMyOrdersView(orders, query = '') {
      const container = document.getElementById('my-orders-list-container');
      if (!container) return;

      if (!orders || orders.length === 0) {
        container.innerHTML = `
          <div class="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
            <div class="text-3xl">📭</div>
            <h4 class="font-bold text-sm text-brandNavy">No Orders Found</h4>
            <p class="text-xs text-slate-500 max-w-sm mx-auto">
              ${query ? `No order matching "${query}". Check your Order ID or phone number.` : 'You haven\\'t placed any software orders yet. Browse our genuine software licenses to get started.'}
            </p>
            <button onclick="closeMyOrdersModal(); navigate('software');" class="bg-brandBlue text-white text-xs font-bold px-4 py-2 rounded-xl">
              Browse Software Store →
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = orders.map(order => {
        const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
        const isPaid = order.paymentStatus === 'Paid';
        const items = order.items || [];
        const isCompleted = order.orderStatus === 'Completed' || order.orderStatus === 'License Key Sent';

        return `
          <div class="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-4">
            
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono font-black text-sm text-brandNavy">${order.orderId}</span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                    ${isPaid ? '✓ Paid Online (PayU)' : '💵 Cash on Delivery'}
                  </span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5">Placed on ${dateStr}</div>
              </div>
              <div class="text-left sm:text-right">
                <div class="text-base font-black text-brandNavy">₹${order.total}</div>
                <div class="text-[10px] font-extrabold uppercase tracking-wider ${isCompleted ? 'text-emerald-600' : 'text-blue-600'}">
                  ● ${order.orderStatus || 'Processing'}
                </div>
              </div>
            </div>

            <div class="py-2">
              <div class="flex items-center justify-between relative text-[10px] font-bold text-slate-500">
                <div class="flex flex-col items-center z-10">
                  <div class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs mb-1">✓</div>
                  <span>Placed</span>
                </div>
                <div class="flex flex-col items-center z-10">
                  <div class="w-6 h-6 rounded-full ${isPaid ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'} flex items-center justify-center font-bold text-xs mb-1">
                    ${isPaid ? '✓' : '•'}
                  </div>
                  <span>${isPaid ? 'Paid' : 'COD Verified'}</span>
                </div>
                <div class="flex flex-col items-center z-10">
                  <div class="w-6 h-6 rounded-full ${isCompleted ? 'bg-emerald-600 text-white' : 'bg-brandBlue text-white animate-pulse'} flex items-center justify-center font-bold text-xs mb-1">
                    ${isCompleted ? '✓' : '⏳'}
                  </div>
                  <span>Processing</span>
                </div>
                <div class="flex flex-col items-center z-10">
                  <div class="w-6 h-6 rounded-full ${isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'} flex items-center justify-center font-bold text-xs mb-1">
                    ${isCompleted ? '✓' : '🚀'}
                  </div>
                  <span>Key Delivered</span>
                </div>
                <div class="absolute top-3 left-4 right-4 h-0.5 bg-slate-200 -z-0">
                  <div class="h-full bg-emerald-500" style="width: ${isCompleted ? '100%' : '66%'}"></div>
                </div>
              </div>
            </div>

            <div class="bg-white rounded-xl p-3 border border-slate-200/80 space-y-2 text-xs">
              <div class="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Ordered Software:</div>
              ${items.map(it => `
                <div class="flex justify-between items-center text-slate-800">
                  <span class="font-semibold line-clamp-1">${it.title} <span class="text-slate-400">×${it.quantity}</span></span>
                  <span class="font-bold whitespace-nowrap ml-2">₹${it.price * it.quantity}</span>
                </div>
              `).join('')}
            </div>

            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs pt-1">
              <div class="text-[11px] text-slate-500">
                <span>Deliver to: </span>
                <span class="font-bold text-slate-700">${(order.customer && order.customer.name) || 'Customer'}</span>
                <span> • WhatsApp: </span>
                <span class="font-bold text-slate-700">${(order.customer && order.customer.phone) || ''}</span>
              </div>
              <a href="https://wa.me/919931354354?text=Hi%20Fixfly,%20I%20am%20inquiry%20about%20Order%20${order.orderId}%20status." target="_blank" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-2xs">
                <span>💬 WhatsApp Support</span>
              </a>
            </div>

          </div>
        `;
      }).join('');
    }'''

if old_google_func in content:
    content = content.replace(old_google_func, new_google_and_orders_func, 1)
    print("Replaced handleGoogleOneClickLogin and added My Orders logic")
else:
    print("WARNING: old_google_func not found directly, checking partial")
    idx = content.find('// --- CONTINUING WITH GOOGLE (POINT 5) ---')
    idx2 = content.find('// --- SUPPORT FORM HANDLER (POINT 6) ---')
    if idx != -1 and idx2 != -1:
        content = content[:idx] + new_google_and_orders_func + '\n\n    ' + content[idx2:]
        print("Replaced using boundary slices")

# Also ensure in handlePlaceOrder that local fixfly_orders is ALWAYS updated
old_order_save = '''      if (!createdOrder) {
        createdOrder = {
          orderId: 'FIX-ORD-' + Math.floor(10000 + Math.random() * 90000),
          createdAt: new Date().toISOString(),
          ...orderPayload
        };
        const localOrders = JSON.parse(localStorage.getItem('fixfly_orders')) || [];
        localOrders.unshift(createdOrder);
        localStorage.setItem('fixfly_orders', JSON.stringify(localOrders));
      }'''

new_order_save = '''      if (!createdOrder) {
        createdOrder = {
          orderId: 'FIX-ORD-' + Math.floor(10000 + Math.random() * 90000),
          createdAt: new Date().toISOString(),
          ...orderPayload
        };
      }

      // Always save newly created order to local storage history
      try {
        const localOrders = JSON.parse(localStorage.getItem('fixfly_orders')) || [];
        const existingIdx = localOrders.findIndex(o => o.orderId === createdOrder.orderId);
        if (existingIdx !== -1) {
          localOrders[existingIdx] = createdOrder;
        } else {
          localOrders.unshift(createdOrder);
        }
        localStorage.setItem('fixfly_orders', JSON.stringify(localOrders));
        window.dispatchEvent(new Event('storage'));
      } catch(err) {
        console.warn('Storage save error:', err);
      }'''

if old_order_save in content:
    content = content.replace(old_order_save, new_order_save, 1)
    print("Updated handlePlaceOrder to always save and broadcast local order")
else:
    print("WARNING: old_order_save not found directly")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved JS enhancements to index.html")
