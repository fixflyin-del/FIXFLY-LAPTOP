import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update line 2006 (Digital Dispatch in 10 Mins) to 2 hrs (max 24 hrs)
old_dispatch = '<span class="font-bold text-brandBlue">Digital Dispatch in 10 Mins</span>'
new_dispatch = '<span class="font-bold text-brandBlue">Email & WhatsApp within 2 hrs (Max 24 hrs)</span>'
content = content.replace(old_dispatch, new_dispatch)

# Also add "Track My Order" button in success modal
success_btn_target = '<button onclick="closeSuccessModal()" class="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition">\n          Continue Browsing\n        </button>'
success_btn_replacement = '''<button onclick="closeSuccessModal(); openMyOrdersModal();" class="w-full py-3 bg-blue-50 hover:bg-blue-100 text-brandBlue border border-blue-200 rounded-2xl font-extrabold text-xs transition flex items-center justify-center gap-1.5">
          <span>📦 Track Order Status & Details</span>
          <span>→</span>
        </button>
        <button onclick="closeSuccessModal()" class="w-full py-2.5 text-slate-500 hover:text-slate-800 rounded-2xl font-bold text-xs transition">
          Continue Browsing
        </button>'''
content = content.replace(success_btn_target, success_btn_replacement)

# 2. Add #my-orders-modal and #google-account-chooser-modal right before <!-- MIGRATED WORDPRESS ARTICLES SCRIPT -->
modals_markup = '''  <!-- 7. MY ORDERS & TRACKING MODAL (USER REQUEST POINT 3) -->
  <div id="my-orders-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 hidden overflow-y-auto">
    <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-6 max-h-[90vh] overflow-y-auto flex flex-col justify-between">
      
      <!-- Modal Header -->
      <div class="flex items-start justify-between pb-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl border border-emerald-100 flex-shrink-0 shadow-xs">
            📦
          </div>
          <div>
            <h3 class="text-xl font-black text-brandNavy font-heading">My Orders & Live Tracking</h3>
            <p class="text-xs text-slate-500 mt-0.5">Track your software orders & digital key delivery status</p>
          </div>
        </div>
        <button onclick="closeMyOrdersModal()" class="p-2 text-slate-400 hover:text-slate-700 rounded-full transition" aria-label="Close modal">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Search & Lookup Box -->
      <div class="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row gap-2">
        <div class="relative flex-1">
          <input type="text" id="my-orders-search-input" placeholder="Enter Order ID (e.g. FIX-ORD-...) or Mobile Number" class="w-full text-xs sm:text-sm bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 pl-9 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brandBlue">
          <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>
        <div class="flex gap-2">
          <button onclick="searchMyOrders()" class="bg-brandBlue hover:bg-[#0665af] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-xs whitespace-nowrap">
            Search
          </button>
          <button onclick="loadMyOrdersList(true)" class="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-3 py-2.5 rounded-xl transition whitespace-nowrap">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Orders List Container -->
      <div id="my-orders-list-container" class="space-y-4 my-2 flex-1">
        <!-- Injected via JavaScript -->
      </div>

      <!-- Delivery Guarantee Note -->
      <div class="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
        <div class="flex items-center gap-1.5">
          <span class="text-emerald-600 font-bold">⚡ Key Delivery:</span>
          <span>Delivered to Email & WhatsApp within 2 hrs (Max 24 hrs)</span>
        </div>
        <a href="https://wa.me/919931354354?text=Hi%20Fixfly,%20I%20need%20assistance%20tracking%20my%20software%20order." target="_blank" rel="noopener" class="text-brandBlue font-bold hover:underline flex items-center gap-1">
          <span>Need Help? WhatsApp 9931354354</span>
          <span>→</span>
        </a>
      </div>

    </div>
  </div>

  <!-- 8. GOOGLE ACCOUNT CHOOSER MODAL (OFFICIAL GOOGLE ONE-CLICK - POINT 2) -->
  <div id="google-account-chooser-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 animate-in fade-in zoom-in-95 duration-200">
      
      <!-- Google Logo & Header -->
      <div class="flex flex-col items-center text-center pb-3 border-b border-slate-100">
        <svg class="w-8 h-8 mb-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <h3 class="text-base font-bold text-slate-800 font-heading">Choose an account</h3>
        <p class="text-xs text-slate-500 mt-0.5">to continue to Fixfly Innovations</p>
      </div>

      <!-- Account List -->
      <div class="space-y-2.5">
        <!-- Default Account: Ayat Arman (or saved profile) -->
        <button type="button" onclick="selectGoogleAccount('Ayat Arman', 'ayatarmanok@gmail.com')" class="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-brandBlue/50 transition flex items-center justify-between group text-left shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black flex items-center justify-center text-sm shadow">
              A
            </div>
            <div>
              <div class="text-xs font-bold text-slate-900 group-hover:text-brandBlue transition" id="google-primary-name">Ayat Arman</div>
              <div class="text-[11px] text-slate-500" id="google-primary-email">ayatarmanok@gmail.com</div>
              <div class="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                <span>✓ Active Google Account</span>
              </div>
            </div>
          </div>
          <span class="text-xs text-slate-400 group-hover:text-brandBlue font-bold transition">→</span>
        </button>

        <!-- Custom Account Toggle Box -->
        <div id="google-custom-account-box" class="hidden p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
          <label class="block text-[11px] font-bold text-slate-700">Enter Your Google Email Address:</label>
          <input type="email" id="google-custom-email-input" placeholder="e.g. yourname@gmail.com" class="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brandBlue">
          <div class="flex gap-2">
            <button type="button" onclick="submitCustomGoogleAccount()" class="flex-1 bg-brandBlue hover:bg-[#0665af] text-white text-xs font-bold py-2 rounded-xl transition shadow-xs">
              Confirm & Login
            </button>
            <button type="button" onclick="document.getElementById('google-custom-account-box').classList.add('hidden')" class="text-xs text-slate-500 hover:text-slate-800 py-2 px-3">
              Cancel
            </button>
          </div>
        </div>

        <button type="button" onclick="document.getElementById('google-custom-account-box').classList.toggle('hidden')" class="w-full p-3 rounded-2xl hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition flex items-center gap-3 text-xs font-bold border border-transparent hover:border-slate-200">
          <span class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm">👤</span>
          <span>Use another account</span>
        </button>
      </div>

      <!-- Footer / Cancel -->
      <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>To continue, Google will share your name and email with Fixfly.</span>
        <button type="button" onclick="closeGoogleAccountChooser()" class="font-bold text-slate-600 hover:text-slate-900">
          Cancel
        </button>
      </div>

    </div>
  </div>\n\n'''

target_anchor = '<!-- MIGRATED WORDPRESS ARTICLES SCRIPT -->'
if target_anchor in content:
    content = content.replace(target_anchor, modals_markup + target_anchor, 1)
    print("Added My Orders and Google Account Chooser modals successfully")
else:
    print("WARNING: target_anchor not found")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved index.html with new modals")
