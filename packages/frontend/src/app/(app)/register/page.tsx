"use client";

import RegisterForm from "@/components/register/RegisterForm";
import RegisterPageHeader from "@/components/register/RegisterPageHeader";

export default function RegisterPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RegisterPageHeader />
      <RegisterForm />
    </div>
  );
}
