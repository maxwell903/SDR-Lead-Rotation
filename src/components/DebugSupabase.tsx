// src/components/DebugSupabase.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSalesReps, } from '../hooks/useSupabaseData';

const DebugSupabase: React.FC = () => {
  const [connectionTest, setConnectionTest] = useState<any>({});
  const [rawData, setRawData] = useState<any>(null);
  const hookResult = useSalesReps();

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      console.log('Testing Supabase connection...');
      
      // Test 1: Basic connection
      const { data, error, count } = await supabase
        .from('sales_reps')
        .select('*', { count: 'exact' });

      console.log('Supabase Response:', { data, error, count });
      
      setConnectionTest({
        success: !error,
        error: error?.message,
        count,
        data
      });
      
      setRawData(data);
      
    } catch (err: any) {
      console.error('Connection test failed:', err);
      setConnectionTest({
        success: false,
        error: err.message
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 p-8 overflow-auto">
      <h1 className="text-2xl font-bold mb-4">Supabase Debug Information</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Test */}
        <div className="border p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Connection Test</h2>
          <div className="space-y-2 text-sm">
            <div>Status: {connectionTest.success ? '✅ Connected' : '❌ Failed'}</div>
            <div>Count: {connectionTest.count}</div>
            <div>Error: {connectionTest.error || 'None'}</div>
          </div>
          <button 
            onClick={testConnection}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded"
          >
            Test Again
          </button>
        </div>

        {/* Hook Result */}
        <div className="border p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Hook Result</h2>
          <div className="space-y-2 text-sm">
            <div>Loading: {hookResult.loading ? '⏳ True' : '✅ False'}</div>
            <div>Error: {hookResult.error || 'None'}</div>
            <div>Sales Reps Count: {hookResult.salesReps.length}</div>
          </div>
        </div>

        {/* Raw Data */}
        <div className="border p-4 rounded md:col-span-2">
          <h2 className="text-lg font-semibold mb-2">Raw Database Data</h2>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </div>

        {/* Converted Data */}
        <div className="border p-4 rounded md:col-span-2">
          <h2 className="text-lg font-semibold mb-2">Converted Sales Reps</h2>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(hookResult.salesReps, null, 2)}
          </pre>
        </div>

        {/* Environment Check */}
        <div className="border p-4 rounded md:col-span-2">
          <h2 className="text-lg font-semibold mb-2">Environment</h2>
          <div className="space-y-1 text-sm">
            <div>Supabase URL: {'https://surnilbsstiasesxeabk.supabase.co'}</div>
            <div>Has Auth: {supabase.auth ? '✅' : '❌'}</div>
          </div>
        </div>
      </div>

      <button 
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-green-500 text-white rounded"
      >
        Reload App
      </button>
    </div>
  );
};

export default DebugSupabase;