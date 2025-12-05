import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { ENV } from '../config/env';
import { V2_COMMON_BASE } from '../config';
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
        `${V2_COMMON_BASE}/cds_kds_order_listview`,
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
      <div className="flex justify-center items-center py-3">
        <div className="inline-block w-8 h-8 border-4 border-primary border-r-transparent rounded-full animate-spin" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-100 border border-yellow-200 text-yellow-800 text-center py-2 rounded mb-2" role="alert">
        {error}
      </div>
    );
  }

  if (!subscriptionData) {
    return (
      <div className="bg-blue-100 border border-blue-200 text-blue-800 text-center py-2 rounded mb-2" role="alert">
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
    <div className="flex justify-center w-full mb-2.5">
      <div className="bg-white rounded-lg shadow-[0_1px_4px_rgba(80,89,111,0.06)] border border-[#ededed] w-full max-w-[300px] mx-auto">
        <div className="px-3 pt-2 pb-1.5">
          <div className="font-semibold text-[0.85rem] text-[#222] mb-1">
            Timeline
          </div>
          <div className="w-full mb-1.5">
            <div className="h-4 rounded-lg bg-[#e4e6ea] relative overflow-hidden w-full">
              <div
                className="absolute top-0 left-0 h-full rounded-lg transition-all duration-300 z-10"
                style={{
                  width: `${percentage}%`,
                  background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs mx-0.5">
            <span className="text-gray-700 font-medium">{completedDays} days completed</span>
            <span className={`font-medium ${remainingDays <= 5 ? 'text-red-500' : 'text-gray-700'}`}>{remainingDays} days remaining</span>
          </div>
        </div>
      </div>
    </div>
  ) : null;
};

export default SubscriptionRemainDay;