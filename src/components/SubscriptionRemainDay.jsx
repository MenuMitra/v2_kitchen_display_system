import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

const SubscriptionRemainDay = ({ selectedOutlet, dateRange, subscriptionData: propSubscriptionData }) => {
  const [subscriptionData, setSubscriptionData] = useState(propSubscriptionData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const authData = localStorage.getItem("authData");
  let token = null;
  if (authData) {
    try {
      token = JSON.parse(authData).access_token;
    } catch (err) {
      console.error("Failed to parse authData", err);
    }
  }

  const fetchSubscriptionData = async ({ queryKey }) => {
    const [, outletId, currentDateRange] = queryKey;
    if (!outletId || !token) return null;
    try {
      const requestPayload = {
        outlet_id: outletId,
        date_filter: currentDateRange || 'today',
        owner_id: 1,
        app_source: 'admin',
      };
      const response = await axios.post(
        'https://men4u.xyz/v2/common/cds_kds_order_listview',
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = response.data;
      return data && data.subscription_details ? data.subscription_details : null;
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
        return null;
      }
      throw err;
    }
  };

  const { data: subscriptionFromQuery, isLoading, error: queryError } = useQuery({
    queryKey: ['subscription', selectedOutlet?.outlet_id, dateRange],
    enabled: !!selectedOutlet?.outlet_id && !propSubscriptionData,
    queryFn: fetchSubscriptionData,
  });

  useEffect(() => {
    if (propSubscriptionData) {
      setSubscriptionData(propSubscriptionData);
      setError('');
      setLoading(false);
    } else {
      setSubscriptionData(subscriptionFromQuery || null);
      setError(queryError ? 'Failed to fetch subscription data' : '');
      setLoading(!!isLoading);
    }
  }, [propSubscriptionData, subscriptionFromQuery, isLoading, queryError]);

  // Removed today-based calculations; rely only on start_date, end_date, and optional status

  const calculateTotalDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  };

  // Color and status derived from remaining days

  // Hide timeline until outlet is selected
  if (!selectedOutlet || !selectedOutlet.outlet_id) {
    return null;
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-3">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-warning text-center py-2" role="alert">
        {error}
      </div>
    );
  }

  if (!subscriptionData) {
    return (
      <div className="alert alert-info text-center py-2" role="alert">
        No subscription data available
      </div>
    );
  }

  const totalDays = calculateTotalDays(subscriptionData.start_date, subscriptionData.end_date);
  // startDate currently not used in UI; keep if needed later
  // const startDate = new Date(subscriptionData.start_date);
  const endDate = new Date(subscriptionData.end_date);
  const currentDate = new Date();

  const remainingDaysRaw = Math.ceil((endDate - currentDate) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.max(0, remainingDaysRaw);
  const completedDays = Math.max(0, totalDays - remainingDays);

  const percentage = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;

  let color = '#177841';
  if (remainingDays <= 5) {
    color = '#d10606';
  } else if (remainingDays <= 15) {
    color = '#F59E0B';
  }

  return remainingDays <= 5 ? (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '10px' }}>
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 4px rgba(80,89,111,0.06)',
        border: '1px solid #ededed',
        width: '100%',
        maxWidth: '300px',
        margin: '0 auto',
      }}>
        <div style={{ padding: '8px 12px 6px 12px' }}>
          <div style={{
            fontWeight: 600,
            fontSize: '0.85rem',
            color: '#222',
            marginBottom: '4px'
          }}>
            Timeline
          </div>
          <div style={{ width: '100%', marginBottom: '6px' }}>
            <div style={{
              height: '16px',
              borderRadius: '8px',
              background: '#e4e6ea',
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${percentage}%`,
                background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                borderRadius: '8px',
                transition: 'all 0.3s',
                zIndex: 1,
              }} />
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            margin: '0 2px'
          }}>
            <span style={{ color: '#374151', fontWeight: '500' }}>{completedDays} days completed</span>
            <span style={{ color: remainingDays <= 5 ? '#ef4444' : '#374151', fontWeight: '500' }}>{remainingDays} days remaining</span>
          </div>
        </div>
      </div>
    </div>
  ) : null;
};

export default SubscriptionRemainDay;