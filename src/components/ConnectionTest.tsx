// src/components/ConnectionTest.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const ConnectionTest: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'connected' | 'error'>('testing');
  const [error, setError] = useState<string | null>(null);
  const [tableCount, setTableCount] = useState<number>(0);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      setError(null);

      // Test basic connection
      const { data, error, count } = await supabase
        .from('sales_reps')
        .select('*', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      setTableCount(count || 0);
      setConnectionStatus('connected');
    } catch (err: any) {
      setConnectionStatus('error');
      setError(err.message || 'Unknown error');
      console.error('Connection test failed:', err);
    }
  };

  const seedInitialData = async () => {
    try {
      // Insert initial sales reps data (your existing reps)
      const initialReps = [
        {
          id: '1',
          name: 'Laura',
          parameters: {
            propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
            maxUnits: null,
            canHandle1kPlus: true
          },
          rotation_order: 1,
          sub1k_order: 1,
          over1k_order: 1,
          status: 'active'
        },
        {
          id: '2',
          name: 'Matt',
          parameters: {
            propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
            maxUnits: null,
            canHandle1kPlus: false
          },
          rotation_order: 2,
          sub1k_order: 2,
          status: 'active'
        },
        {
          id: '3',
          name: 'Dan',
          parameters: {
            propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
            maxUnits: null,
            canHandle1kPlus: true
          },
          rotation_order: 3,
          sub1k_order: 3,
          over1k_order: 2,
          status: 'active'
        }
      ];

      const { error } = await supabase
        .from('sales_reps')
        .upsert(initialReps);

      if (error) throw error;

      alert('Initial data seeded successfully!');
      testConnection(); // Refresh the connection test
    } catch (err: any) {
      alert(`Error seeding data: ${err.message}`);
    }
  };

  return (
    <div className="fixed top-4 right-4 bg-white border rounded-lg p-4 shadow-lg z-50 max-w-md">
      <h3 className="font-semibold mb-2">Supabase Connection Status</h3>
      
      <div className="flex items-center gap-2 mb-2">
        <div 
          className={`w-3 h-3 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'error' ? 'bg-red-500' : 
            'bg-yellow-500'
          }`}
        />
        <span className="text-sm">
          {connectionStatus === 'connected' ? 'Connected' : 
           connectionStatus === 'error' ? 'Error' : 
           'Testing...'}
        </span>
      </div>

      {connectionStatus === 'connected' && (
        <div className="text-sm text-gray-600 mb-2">
          Sales reps in database: {tableCount}
        </div>
      )}

      {connectionStatus === 'error' && (
        <div className="text-sm text-red-600 mb-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button 
          onClick={testConnection}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          Test Again
        </button>
        
        {connectionStatus === 'connected' && tableCount === 0 && (
          <button 
            onClick={seedInitialData}
            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
          >
            Seed Data
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionTest;