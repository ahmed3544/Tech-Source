import React, { useState } from 'react';
import { CloudUpload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface DriveBackupButtonProps {
  csvData: string;
  filename: string;
  lang: 'ar' | 'en';
}

export const DriveBackupButton: React.FC<DriveBackupButtonProps> = ({ csvData, filename, lang }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const uploadToDrive = async (accessToken: string) => {
    try {
      const metadata = {
        name: filename,
        mimeType: 'text/csv',
      };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([csvData], { type: 'text/csv' }));

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      if (!response.ok) throw new Error('Upload failed');
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = () => {
    if (typeof google === 'undefined') {
      alert(lang === 'ar' ? 'جاري تحميل مكتبة جوجل، يرجى المحاولة لاحقاً.' : 'Google library loading, please try again.');
      return;
    }
    
    setLoading(true);
    setStatus('idle');
    
    const client = google.accounts.oauth2.initTokenClient({
      client_id: '501556944186-r0nnq54ivnheguqjvp3c2abtgfsl3rsb.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          uploadToDrive(tokenResponse.access_token);
        } else {
          setLoading(false);
          setStatus('error');
        }
      },
    });
    
    client.requestAccessToken();
  };

  return (
    <button
      onClick={handleBackup}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
        status === 'success' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
        status === 'error' ? 'bg-rose-100 text-rose-800 border-rose-200' :
        'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : status === 'error' ? (
        <AlertCircle className="w-4 h-4" />
      ) : (
        <CloudUpload className="w-4 h-4" />
      )}
      <span>
        {loading ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') :
         status === 'success' ? (lang === 'ar' ? 'تم الحفظ' : 'Saved') :
         status === 'error' ? (lang === 'ar' ? 'فشل الحفظ' : 'Failed') :
         (lang === 'ar' ? 'حفظ في درايف' : 'Save to Drive')}
      </span>
    </button>
  );
};
